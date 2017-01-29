import createRavenMiddleware from "./index";
import { createStore, applyMiddleware } from "redux";

const action = { type: "INCREMENT" };

describe("Raven Redux Middleware (unit test)", () => {
  let Raven, mockStore, next, middleware, state;
  beforeEach(() => {
    state = 0;
    Raven = {
      context: jest.fn((options, func) => func()),
      captureBreadcrumb: jest.fn(),
      setExtraContext: jest.fn()
    };
    mockStore = { getState: jest.fn(() => state++) };
    next = jest.fn();
    middleware = createRavenMiddleware(Raven);
  });
  it("calls next()", () => {
    middleware(mockStore)(next)(action);
    expect(next).toHaveBeenCalledWith(action);
  });
  it("adds action types to the breadcrumbs", () => {
    middleware(mockStore)(next)(action);
    expect(Raven.captureBreadcrumb).toHaveBeenCalledWith({
      category: "redux-action",
      data: action
    });
  });
  it("sets the initial state as context when first booting up", () => {
    middleware(mockStore);
    expect(Raven.setExtraContext).toHaveBeenCalledWith({ state: 0 });
  });
  it("sets the new state and last action as context", () => {
    middleware(mockStore)(next)(action);
    expect(Raven.setExtraContext).toHaveBeenCalledWith({
      lastAction: action,
      state: 1
    });
  });
});

const reducer = (state = 0, action) => {
  switch (action.type) {
    case "INCREMENT":
      return state + 1;
    case "THROW":
      throw new Error("Your reducer errored");
  }
  return state;
};

const mockCapture = (options, func) => {
    try {
        func();
    } catch(e) {
        throw new Error('Caught error');
    }
}
describe("Raven Redux Middleware (integration tests)", () => {
  let Raven, store;
  beforeEach(() => {
    Raven = {
      context: jest.fn(mockCapture),
      captureBreadcrumb: jest.fn(),
      setExtraContext: jest.fn()
    };
    store = createStore(reducer, applyMiddleware(createRavenMiddleware(Raven)));
  });
  it("store starts out in default state", () => {
    expect(store.getState()).toBe(0);
  });
  it("logs initial state to Raven", () => {
    expect(Raven.setExtraContext).toHaveBeenCalledWith({ state: 0 });
  });
  it("captures breadcrumbs", () => {
    store.dispatch(action);

    expect(Raven.captureBreadcrumb).toHaveBeenCalledWith({
      category: "redux-action",
      data: action
    });
  });
  it("sets new state and last action as extra context", () => {
    store.dispatch(action);

    expect(Raven.setExtraContext).toHaveBeenCalledWith({
      lastAction: action,
      state: 1
    });
  });
  it("sets new state and last action as extra context", () => {
    store.dispatch(action);

    expect(Raven.setExtraContext).toHaveBeenCalledWith({
      lastAction: action,
      state: 1
    });
  });
  it("sets new state and last action as extra context", () => {
    store.dispatch({type: 'THROW'});
  });
});
