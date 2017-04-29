 [![Travis](https://img.shields.io/travis/captbaritone/raven-for-redux.svg)]() [![Codecov](https://img.shields.io/codecov/c/github/captbaritone/raven-for-redux.svg)]()

 _Note:_ Raven 3.14.0 has a bug (https://github.com/getsentry/raven-js/issues/925)
 which this library triggers.

# Raven Middleware for Redux

Logs the type of each dispatched action to Raven as "breadcrumbs" and attaches
your last action and current Redux state as additional context.

Inspired by [redux-raven-middleware] but with a slightly different approach.

## Installation

    npm install --save raven-for-redux

## Usage

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

## Improvements

This library makes, what I think are, a few improvements over
`redux-raven-middlware`:

1. Raven is injected rather than being setup inside the middleware. This allows
   for more advanced configuration of Raven, as well as cases where Raven has
   already been initialized. For example, if you include Raven as its own
   `<script>` tag.
2. Adds your state and last action as context to _all_ errors, not just reducer
   exceptions.

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

Raven allows you to attach additional context information to each breadcrumb in
the form of a `data` object. `breadcrubmDataFromAction` allows you to specify
a transform function which is passed the `action` object and returns a `data`
object.

The default implementation of this function returns `undefined`, which means no
data is attached.  This is because there are __a few gotchas__:

* The data object must be "flat". In other words, each value of the object must be a string. The values may not be arrays or other objects.
* Sentry limits the total size of your error report. If you send too much data,
  the error will not be recorded. If you are going to attach data to your
  breadcrumbs, be sure you understand the way it will affect the total size
  of your report.

Be careful not to mutate your `action` within this function.

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

#### `stateTransformer`

Default: `state => state` _(Function)_

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

## Changelog

### 1.0.0

* No changes. Just bringing the project out of beta.

### 0.7.1

* Refactor: Use implicit binding to track the state/last action. ([1def9a7])

### 0.7.0

* Return the next middleware's (or the actual `dispatch` function's) return value. ([#11])

### 0.6.0

* `actionTransformeri` and `stateTransformer` are only run when reporting an error, rather than on every action. ([#8])


[redux-raven-middleware]: https://github.com/ngokevin/redux-raven-middleware
[Raven]: https://docs.sentry.io/clients/javascript/
[Raven Breadcrumbs]: https://docs.sentry.io/clients/javascript/usage/#recording-breadcrumbs
[Breadcrumb documentation]: https://docs.sentry.io/learn/breadcrumbs/
[`dataCallback`]: https://docs.sentry.io/clients/javascript/config/
[#11]: https://github.com/captbaritone/raven-for-redux/pull/11
[#8]: https://github.com/captbaritone/raven-for-redux/pull/8
[1def9a7]: https://github.com/captbaritone/raven-for-redux/commit/1def9a747d7b711ad93da531b8ff9d128c352b45
