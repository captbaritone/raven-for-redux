const identity = x => x;
const getUndefined = () => {};
function createRavenMiddleware(Raven, options = {}) {
  // TODO: Validate options.
  const {
    breadcrumbDataFromAction = getUndefined,
    actionTransformer = identity,
    stateTransformer = identity,
    breadcrumbCategory = "redux-action"
  } = options;

  return store => {
    let lastAction;

    Raven.setDataCallback((data, original) => {
      data.extra.lastAction = actionTransformer(lastAction);
      data.extra.state = stateTransformer(store.getState());
      return original ? original(data) : data;
    });

    return next => action => {
      // Log the action taken to Raven so that we have narrative context in our
      // error report.
      Raven.captureBreadcrumb({
        category: breadcrumbCategory,
        message: action.type,
        data: breadcrumbDataFromAction(action)
      });

      lastAction = action;
      return next(action);
    };
  };
}

module.exports = createRavenMiddleware;
