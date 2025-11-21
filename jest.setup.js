// Learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom'

// Polyfill Request/Response for Node.js environment
if (typeof global.Request === 'undefined') {
  const { Request, Response } = require('undici');
  global.Request = Request;
  global.Response = Response;
}

