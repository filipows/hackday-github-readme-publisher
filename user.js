const USERS = {};

function setUserToken(userId, token) {
  USERS[userId] = {
    accessToken: token,
  };
}

function getUserToken(userId) {
  return USERS[userId] && USERS[userId].accessToken;
}

module.exports = { setUserToken, getUserToken };
