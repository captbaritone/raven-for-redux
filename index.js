function createRavenMiddleware(Raven) {
  return store => {
    // Record the initial state in case we crash before the first action
    // succeeds.
    Raven.setExtraContext({ state: store.getState() });

    return next => action => {
      // Log the action taken to Raven so that we have
      Raven.captureBreadcrumb({
        category: "redux-action",
        message: action.name,
        data: action
      });

      // Set the action as context in case we crash in the reducer.
      Raven.context({ lastAction: action }, () => next(action));

      // Set the last action and state as context in case we crash before
      // the next action is dispatched.
      Raven.setExtraContext({ lastAction: action, state: store.getState() });
    };
  };
}

export default createRavenMiddleware;
