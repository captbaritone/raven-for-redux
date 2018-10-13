const stringify = require("./vendor/json-stringify-safe/stringify");

const identity = x => x;
const getUndefined = () => {};
const filter = () => true;
function createRavenMiddleware(Raven, options = {}) {
  // TODO: Validate options.
  const {
    breadcrumbDataFromAction = getUndefined,
    actionTransformer = identity,
    stateTransformer = identity,
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

    const retryCaptureWithoutReduxState = (errorMessage, captureFn) => {
      Raven.setDataCallback((data, originalCallback) => {
        Raven.setDataCallback(originalCallback);
        const reduxExtra = {
          lastAction: actionTransformer(lastAction),
          state: errorMessage
        };
        data.extra = Object.assign(reduxExtra, data.extra);
        data.breadcrumbs.values = [];
        return data;
      });
      // Raven has an internal check for duplicate errors that we need to disable.
      const originalAllowDuplicates = Raven._globalOptions.allowDuplicates;
      Raven._globalOptions.allowDuplicates = true;
      captureFn();
      Raven._globalOptions.allowDuplicates = originalAllowDuplicates;
    };

    const retryWithoutStateIfRequestTooLarge = originalFn => {
      return (...captureArguments) => {
        const originalTransport = Raven._globalOptions.transport;
        Raven.setTransport(opts => {
          Raven.setTransport(originalTransport);
          const requestBody = stringify(opts.data);
          if (requestBody.length > 200000) {
            // We know the request is too large, so don't try sending it to Sentry.
            // Retry the capture function, and don't include the state this time.
            const errorMessage =
              "Could not send state because request would be larger than 200KB. " +
              `(Was: ${requestBody.length}B)`;
            retryCaptureWithoutReduxState(errorMessage, () => {
              originalFn.apply(Raven, captureArguments);
            });
            return;
          }
          opts.onError = error => {
            if (error.request && error.request.status === 413) {
              const errorMessage =
                "Failed to submit state to Sentry: 413 request too large.";
              retryCaptureWithoutReduxState(errorMessage, () => {
                originalFn.apply(Raven, captureArguments);
              });
            }
          };
          (originalTransport || Raven._makeRequest).call(Raven, opts);
        });
        originalFn.apply(Raven, captureArguments);
      };
    };

    Raven.captureException = retryWithoutStateIfRequestTooLarge(
      Raven.captureException
    );
    Raven.captureMessage = retryWithoutStateIfRequestTooLarge(
      Raven.captureMessage
    );

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
