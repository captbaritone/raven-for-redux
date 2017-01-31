# Raven Middleware for Redux

Logs all dispatched actions to Raven as "breadcrumbs" and attaches your current
Redux store as additional context.

Inspired by
[redux-raven-middleware](https://github.com/ngokevin/redux-raven-middleware)
but with a slightly different approach.

## Usage

```JavaScript
// store.js
import createRavenMiddleware from "raven-redux-middleware";
import { createStore, applyMiddleware } from "redux";
import Raven from "raven";
import { reducer } from "./my_reducer";

Raven.config('<YOUR_DSN>').install();

export default createStore(
    reducer,
    applyMiddleware(
        createRavenMiddleware(Raven)
    )
);
```

## Improvements

This library makes, what I think are, a few improvements over
`redux-raven-middlware`:

1. Raven is injected rather than being setup inside the middleware. This allows
   for more advanced configuration of Raven, as well as cases where Raven has
   already been initialized. For example, if you include Raven as its own
   `<script>` tag.
2. Adds your state as context to _all_ errors, not just reducer exceptions.

## API: `createRavenMiddleware(Raven, [options])`

Options:

* `actionTransformer`: Transform the last action before sending to Sentry.
* `stateTransformer`: Transform the current state before sending to Sentry.
