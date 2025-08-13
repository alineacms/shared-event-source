import {handler} from '../web/handler'

export function onRequest(context) {
  return handler(context.request)
}
