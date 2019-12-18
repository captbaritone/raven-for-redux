import * as Sentry from "@sentry/browser";
import React from "react";
import { render } from "react-dom";
import { createStore, applyMiddleware } from "redux";
import createSentryMiddleware from "../"; // "sentry-for-redux"

const SENTRY_DSN = "https://5d5bf17b1bed4afc9103b5a09634775e@sentry.io/146969";
Sentry.init({ dsn: SENTRY_DSN });

// A very error-prone reducer.
const reducer = (state = "Hello world!", action) => {
  switch (action.type) {
    case "CRASH_IN_THE_REDUCER":
      throw new Error("Whoops, we crashed in the reducer!");
    case "UPDATE_MY_STRING":
      return action.str;
    default:
      return state;
  }
};

const store = createStore(
  reducer,
  applyMiddleware(
    createSentryMiddleware(Sentry, {
      breadcrumbDataFromAction: action => {
        return { STRING: action.str };
      }
    })
  )
);

document.getElementById("crash").addEventListener("click", () => {
  throw new Error("Whoops! My application crashed!");
});
document.getElementById("crash-in-reducer").addEventListener("click", () => {
  store.dispatch({ type: "CRASH_IN_THE_REDUCER" });
});
document.getElementById("set-state").addEventListener("click", () => {
  store.dispatch({
    type: "UPDATE_MY_STRING",
    str: document.getElementById("state").value
  });
});

const Button = () => (
  <button
    onClick={() => {
      store.dispatch({ type: "CRASH_IN_THE_REDUCER" });
    }}
  >
    Click to crash
  </button>
);

render(<Button />, document.getElementById("react-app"));

/*
// This should leave a breadcrumb, and leave lastAction and state as context.
store.dispatch({ type: "UPDATE_MY_STRING", str: "I've reached step one!" });

// This should leave a breadcrumb, and leave lastAction as context, even though
// it will crash.

store.dispatch({ type: "UPDATE_MY_STRING", str: "I've reached step two!" });

// We should still see our current state and lastAction in our context, even
// though we crashed outside the reducer.
throw new Error("Whoops! I crashed somewhere in my application!");
*/
