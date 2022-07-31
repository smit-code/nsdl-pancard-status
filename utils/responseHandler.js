function prepareSuccessResponse (data, message) {
  return {
    success: true,
    data,
    message
  }
}

function prepareErrorResponse (message) {
  return {
    success: false,
    message
  }
}

module.exports = {
  prepareSuccessResponse,
  prepareErrorResponse
}
