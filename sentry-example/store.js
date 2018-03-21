import { createStore, applyMiddleware } from 'redux'
import { Sentry } from 'react-native-sentry'
import createRavenMiddleware from 'raven-for-redux' // raven-for-redux

import { rootReducers } from '../reducers'

const logger = createLogger()

const SentryDSN = 'https://xxxxx@sentry.io/xxxxx'
Sentry.config(SentryDSN).install()

export const configureStore = () => {
  const store = createStore(
    applyMiddleware(
      reducer,
       createRavenMiddleWare(Sentry, {
        breadcrumbDataFromAction: action => {
          return { STRING: action.str }
        }
      })
    )
  )
  return { store }
}
