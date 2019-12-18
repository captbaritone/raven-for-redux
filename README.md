 [![Travis](https://img.shields.io/travis/captbaritone/sentryn-for-redux.svg)]() [![Codecov](https://img.shields.io/codecov/c/github/captbaritone/sentryn-for-redux.svg)]()

__This package used to be called `raven-for-redux` and work with the Raven package. As of version 2.0 it requires the Sentry JavaScript SDK instead.__

# Sentry Middleware for Redux

Logs the type of each dispatched action to Sentry as "breadcrumbs" and attaches
your last action and current Redux state as additional context. It works with either
`@sentry/browser` and `@sentry/node` (theoretically it should work with
`@sentry/react-native` but that is untested).

Inspired by [redux-raven-middleware] but with a slightly different approach.

## Installation

    npm install --save sentry-for-redux
    # ... or
    yarn add sentry-for-redux

## Usage

### Browser/Node

```JavaScript
// store.js

import * as Sentry from "@sentry/browser"; // Or "@sentry/node"
import { createStore, applyMiddleware } from "redux";
import createSentryMiddleware from "sentryn-for-redux";

import { reducer } from "./my_reducer";

Sentry.init({dsn: "<YOUR_DSN>"});

export default createStore(
    reducer,
    applyMiddleware(
        // Middlewares, like `redux-thunk` that intercept or emit actions should
        // precede `sentryn-for-redux`.
        createSentryMiddleware(Sentry, {
            // Optionally pass some options here.
        })
    )
);
```

For a working example, see the [example](./example/) directory.

### TypeScript
`sentry-for-redux` does not yet have TypeScript types. If you can help add them I'd be greatful for the help.

## API: `createSentryMiddleware(Sentry, [options])`

### Arguments

* `Sentry` _(Sentry Object)_: A configured and "installed"
  [Sentry] object.
* [`options`] _(Object)_: See below for detailed documentation.

### Options

While the default configuration should work for most use cases, Sentry for Redux
can be configured by providing an options object with any of the following
optional keys.

#### `breadcrumbMessageFromAction` _(Function)_

Default: `action => action.type`

`breadcrumbMessageFromAction` allows you to specify a transform function which is passed the `action` object and returns a `string` that will be used as the message of the breadcrumb.

By default `breadcrumbMessageFromAction` returns `action.type`.

Finally, be careful not to mutate your `action` within this function.

See the Sentry [Breadcrumb documentation].

#### `breadcrumbDataFromAction` _(Function)_

Sentry allows you to attach additional context information to each breadcrumb
in the form of a `data` object. `breadcrumbDataFromAction` allows you to specify
a transform function which is passed the `action` object and returns a `data`
object. Which will be logged to Sentry along with the breadcrumb.

_Ideally_ we could log the entire content of each action. If we could, we
could perfectly replay the user's entire session to see what went wrong.

If this option is omitted, no data is attached. This is because there are __a few gotchas__:

* The data object must be "flat". In other words, each value of the object must be a string. The values may not be arrays or other objects.
* Sentry limits the total size of your error report. If you send too much data,
  the error will not be recorded. If you are going to attach data to your
  breadcrumbs, be sure you understand the way it will affect the total size
  of your report.

Finally, be careful not to mutate your `action` within this function.

See the Sentry [Breadcrumb documentation].

#### `actionTransformer` _(Function)_

Default: `action => action`

In some cases your actions may be extremely large, or contain sensitive data.
In those cases, you may want to transform your action before sending it to
Sentry. This function allows you to do so. It is passed the last dispatched
`action` object, and should return a serializable value.

Be careful not to mutate your `action` within this function.

#### `stateTransformer` _(Function)_

Default: `state => state`

In some cases your state may be extremely large, or contain sensitive data.
In those cases, you may want to transform your state before sending it to
Sentry. This function allows you to do so. It is passed the current state
object, and should return a serializable value.

Be careful not to mutate your `state` within this function.

#### `breadcrumbCategory` _(String)_

Default: `"redux-action"`

Each breadcrumb is assigned a category. By default all action breadcrumbs are
given the category `"redux-action"`. If you would prefer a different category
name, specify it here.

#### `filterBreadcrumbActions` _(Function)_

Default: `action => true`

If your app has certain actions that you do not want to send to Sentry, pass
a filter function in this option. If the filter returns a truthy value, the
action will be added as a breadcrumb, otherwise the action will be ignored.
Note: even when the action has been filtered out, it may still be sent to
Sentry as part of the extra data, if it was the last action before an error.

This option was introduced in version 1.1.1.

#### `getUserContext` _(Optional Function)_

Signature: `state => userContext`

Sentry allows you to associcate a [user context] with each error report.
`getUserContext` allows you to define a mapping from your Redux `state` to
the user context. When `getUserContext` is specified, the result of
`getUserContext` will be used to derive the user context before sending an
error report. Be careful not to mutate your `state` within this function.

This option was introduced in version 1.2.0.

#### `getTags` _(Optional Function)_

Signature: `state => tags`

Sentry allows you to associate [tags] with each report.
`getTags` allows you to define a mapping from your Redux `state` to
an object of tags (key → value). Be careful not to mutate your `state`
within this function.

This option was introduced in version 1.3.1.

## Changelog

### 2.0

For version 2.0 we forked the library `raven-for-redux` and moved from being
a library for Raven to being a library for the new Sentry SDK. In order to
preserve the history created in the `raven-for-redux` library, we're starting
`sentry-for-redux` at version 2.0. All previous versions listed below were
released as `raven-for-redux`. The old module still exists if you are using
Raven.

The fork uses the exact same API as `raven-for-redux` except that you pass a `Sentry` object
instead of a `Raven` object.

### 1.4.0

* Add `breadcrumbMessageFromAction` method. ([#98])

### 1.3.1

* Add `getTags` option. ([#69])

### 1.3.0

* The Raven "extras" that we add are merged with existing extras rather than replacing them. ([#59])

### 1.2.0

* Add `getUserContext` option. ([#49])

### 1.1.1

* Add `filterBreadcrumbActions` option. ([#39])

### 1.0.0

* No changes. Just bringing the project out of beta.

### 0.7.1

* Refactor: Use implicit binding to track the state/last action. ([1def9a7])

### 0.7.0

* Return the next middleware's (or the actual `dispatch` function's) return value. ([#11])

### 0.6.0

* `actionTransformer` and `stateTransformer` are only run when reporting an error, rather than on every action. ([#8])


[redux-raven-middleware]: https://github.com/ngokevin/redux-raven-middleware
[Sentry]: https://docs.sentry.io/platforms/javascript/
[Raven Breadcrumbs]: https://docs.sentry.io/clients/javascript/usage/#recording-breadcrumbs
[Breadcrumb documentation]: https://docs.sentry.io/learn/breadcrumbs/
[user context]: https://docs.sentry.io/learn/context/#capturing-the-user
[tags]: https://docs.sentry.io/learn/context/#tagging-events
[#11]: https://github.com/captbaritone/raven-for-redux/pull/11
[#8]: https://github.com/captbaritone/raven-for-redux/pull/8
[1def9a7]: https://github.com/captbaritone/raven-for-redux/commit/1def9a747d7b711ad93da531b8ff9d128c352b45
[#39]: https://github.com/captbaritone/raven-for-redux/pull/39
[#49]: https://github.com/captbaritone/raven-for-redux/pull/49
[#59]: https://github.com/captbaritone/raven-for-redux/pull/59
[#69]: https://github.com/captbaritone/raven-for-redux/pull/69
[#98]: https://github.com/captbaritone/raven-for-redux/pull/98
