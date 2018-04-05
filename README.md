 [![Travis](https://img.shields.io/travis/captbaritone/raven-for-redux.svg)]() [![Codecov](https://img.shields.io/codecov/c/github/captbaritone/raven-for-redux.svg)]()

 _Note:_ Requires Raven >= 3.9.0. Raven 3.14.0 has [a bug](https://github.com/getsentry/raven-js/issues/925)
 which this library triggers.

# Raven Middleware for Redux

Logs the type of each dispatched action to Raven as "breadcrumbs" and attaches
your last action and current Redux state as additional context.

Inspired by [redux-raven-middleware] but with a slightly [different approach](#improvements).

## Installation

    npm install --save raven-for-redux

## Usage

### Browser

```JavaScript
// store.js

import Raven from "raven-js"; // Or, you might already have this as `window.Raven`.
import { createStore, applyMiddleware } from "redux";
import createRavenMiddleware from "raven-for-redux";

import { reducer } from "./my_reducer";

Raven.config("<YOUR_DSN>").install();

export default createStore(
    reducer,
    applyMiddleware(
        // Middlewares, like `redux-thunk` that intercept or emit actions should
        // precede `raven-for-redux`.
        createRavenMiddleware(Raven, {
            // Optionally pass some options here.
        })
    )
);
```

For a working example, see the [example](./example/) directory.

### TypeScript
`raven-for-redux` has TypeScript bindings available through [DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped/blob/b7ca35ab023ba1758de9e07004adde71e911c28e/types/raven-for-redux/index.d.ts). Please note the import style below, as it differs from the JavaScript example and is required for these typings.
```TypeScript
import * as Raven from "raven-js";
import * as createRavenMiddleware from "raven-for-redux";
import { applyMiddleware, createStore } from "redux";

//... (same as JavaScript example, but now with proper typings)
```

## Improvements

This library makes, what I think are, a few improvements over
`redux-raven-middlware`:

1. Raven is injected rather than being setup inside the middleware. This allows
   for more advanced configuration of Raven, as well as cases where Raven has
   already been initialized. For example, if you include Raven as its own
   `<script>` tag.
2. Adds your state and last action as context to _all_ errors, not just reducer
   exceptions.
3. Allows filtering action breadcrumbs before sending to Sentry
4. Allows you to define a user context mapping from the state

## API: `createRavenMiddleware(Raven, [options])`

### Arguments

* `Raven` _(Raven Object)_: A configured and "installed"
  [Raven] object.
* [`options`] _(Object)_: See below for detailed documentation.

### Options

While the default configuration should work for most use cases, Raven for Redux
can be configured by providing an options object with any of the following
optional keys.

#### `breadcrumbDataFromAction` _(Function)_

Default: `action => undefined`

Raven allows you to attach additional context information to each breadcrumb
in the form of a `data` object. `breadcrubmDataFromAction` allows you to specify
a transform function which is passed the `action` object and returns a `data`
object. Which will be logged to Sentry along with the breadcrumb.

_Ideally_ we could log the entire content of each action. If we could, we
could perfectly replay the user's entire session to see what went wrong.

However, the default implementation of this function returns `undefined`, which means
no data is attached. This is because there are __a few gotchas__:

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

If you have specified a [`dataCallback`] when you configured Raven, note that
`actionTransformer` will be applied _before_ your specified `dataCallback`.

#### `stateTransformer` _(Function)_

Default: `state => state`

In some cases your state may be extremely large, or contain sensitive data.
In those cases, you may want to transform your state before sending it to
Sentry. This function allows you to do so. It is passed the current state
object, and should return a serializable value.

Be careful not to mutate your `state` within this function.

If you have specified a [`dataCallback`] when you configured Raven, note that
`stateTransformer` will be applied _before_ your specified `dataCallback`.

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

Raven allows you to associcate a [user context] with each error report.
`getUserContext` allows you to define a mapping from your Redux `state` to
the user context. When `getUserContext` is specified, the result of
`getUserContext` will be used to derive the user context before sending an
error report. Be careful not to mutate your `state` within this function.

If you have specified a [`dataCallback`] when you configured Raven, note that
`getUserContext` will be applied _before_ your specified `dataCallback`.
When a `getUserContext` function is given, it will override any previously
set user context.

This option was introduced in version 1.2.0.

#### `getTags` _(Optional Function)_

Signature: `state => tags`

Raven allows you to associate [tags] with each report.
`getTags` allows you to define a mapping from your Redux `state` to
an object of tags (key → value). Be careful not to mutate your `state`
within this function.

This option was introduced in version 1.3.1.

## Changelog

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
[Raven]: https://docs.sentry.io/clients/javascript/
[Raven Breadcrumbs]: https://docs.sentry.io/clients/javascript/usage/#recording-breadcrumbs
[Breadcrumb documentation]: https://docs.sentry.io/learn/breadcrumbs/
[user context]: https://docs.sentry.io/learn/context/#capturing-the-user
[`dataCallback`]: https://docs.sentry.io/clients/javascript/config/
[tags]: https://docs.sentry.io/learn/context/#tagging-events
[#11]: https://github.com/captbaritone/raven-for-redux/pull/11
[#8]: https://github.com/captbaritone/raven-for-redux/pull/8
[1def9a7]: https://github.com/captbaritone/raven-for-redux/commit/1def9a747d7b711ad93da531b8ff9d128c352b45
[#39]: https://github.com/captbaritone/raven-for-redux/pull/39
[#49]: https://github.com/captbaritone/raven-for-redux/pull/49
[#59]: https://github.com/captbaritone/raven-for-redux/pull/59
[#69]: https://github.com/captbaritone/raven-for-redux/pull/69
