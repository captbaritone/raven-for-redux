const identity = x => x;
const getUndefined = () => {};
const filter = () => true;
// Include a heuristic to remove redux-undo history (https://github.com/omnidan/redux-undo)
// 'past' and 'future' are arrays that can include a large number of copies of the state.
const removeHistoryFromObject = obj =>
  Object.assign({}, obj, {
    past: `redux-undo history was automatically removed. (Entries: ${
      obj.past.length
    })`,
    future: `redux-undo history was automatically removed. (Entries: ${
      obj.future.length
    })`
  });
const isReduxUndoState = state =>
  state &&
  state.past &&
  state.present &&
  state.future &&
  typeof state.index === "number" &&
  typeof state.limit === "number";
const removeReduxUndoHistoryFromState = state => {
  if (!state || typeof state !== "object") return state;
  if (isReduxUndoState(state)) {
    return removeHistoryFromObject(state);
  }
  let newState = null;
  Object.entries(state).forEach(([key, store]) => {
    if (isReduxUndoState(store)) {
      if (!newState) newState = Object.assign({}, state);
      newState[key] = removeHistoryFromObject(store);
    }
  });
  return newState || state;
};

function createRavenMiddleware(Raven, options = {}) {
  // TODO: Validate options.
  const {
    breadcrumbDataFromAction = getUndefined,
    actionTransformer = identity,
    stateTransformer = removeReduxUndoHistoryFromState,
    breadcrumbCategory = "redux-action",
    filterBreadcrumbActions = filter,
    getUserContext,
    getTags
  } = options;

  return store => {
    let lastAction;

    Raven.setDataCallback((data, original) => {
      const state = store.getState();
      const reduxExtra = {
        lastAction: actionTransformer(lastAction),
        state: stateTransformer(state)
      };
      data.extra = Object.assign(reduxExtra, data.extra);
      if (getUserContext) {
        data.user = getUserContext(state);
      }
      if (getTags) {
        data.tags = getTags(state);
      }
      return original ? original(data) : data;
    });

    return next => action => {
      // Log the action taken to Raven so that we have narrative context in our
      // error report.
      if (filterBreadcrumbActions(action)) {
        Raven.captureBreadcrumb({
          category: breadcrumbCategory,
          message: action.type,
          data: breadcrumbDataFromAction(action)
        });
      }

      lastAction = action;
      return next(action);
    };
  };
}

module.exports = createRavenMiddleware;
