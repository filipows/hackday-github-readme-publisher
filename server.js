// TODO: 
//  - /configuration should check validity of the tokne
//  - implement token persistency

const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const app = express();
const fs = require("fs");
const cookieParser = require("cookie-parser");

const GithubUploader = require("./github-uploader.js");
const { isValidPostRequest } = require("./signature-verification");
const user = require("./user");

app.use(
  express.json({
    verify: (request, response, buffer) => {
      request.rawBody = buffer.toString();
    },
  })
);
app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: true }));

const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const canvaClientSecret = process.env.CANVA_CLIENT_SECRET;

app.use(express.static("public"));

function isAuthenticated(userId) {
  return user.getUserToken(userId);
}

app.post("/publish/resources/upload", async (request, response) => {
  if (!isValidPostRequest(canvaClientSecret, request)) {
    console.log("invaid signature");
    response.sendStatus(401);
    return;
  }

  const userId = request.body.user;
  const imgUrl = request.body.assets[0].url;
  const imgName = request.body.assets[0].name;

  if (!isAuthenticated(userId)) {
    console.log(`user ${userId} was not authenticated`);
    return response.send({
      type: "ERROR",
      errorCode: "CONFIGURATION_REQUIRED",
    });
  }

  console.log("publish", request.body, request.query);
  const userToken = user.getUserToken(userId);
  const uploader = new GithubUploader(userToken);
  const urlToProfileRepo = await uploader.upload(imgUrl, imgName);

  response.send({
    type: "SUCCESS",
    url: urlToProfileRepo,
  });
});

app.post("/configuration", async (request, response) => {
  if (!isValidPostRequest(canvaClientSecret, request)) {
    console.log("invaid signature");
    response.sendStatus(401);
    return;
  }
  console.log("configuration request body", request.body);
  const userId = request.body.user;

  if (isAuthenticated(userId)) {
    // TODO: Check with Github if token is still valid
    response.send({
      type: "SUCCESS",
      labels: ["PUBLISH"],
    });
  } else {
    response.send({
      type: "ERROR",
      errorCode: "CONFIGURATION_REQUIRED",
    });
  }
});

app.get("/redirect", (req, res) => {
  // console.log("redirect req.body", req.body);
  const userId = req.query.user;
  const canvaState = req.query.state;

  const authorize_uri = "https://github.com/login/oauth/authorize";
  const redirectUri = `https://hackday-github-profile-pic.glitch.me/oauth/redirect`;
  const csrfState = Math.random().toString(36).substring(7);
  res.cookie("csrfState", csrfState, { maxAge: 60000 });
  res.cookie("userId", userId, { maxAge: 60000 });
  res.cookie("canvaState", canvaState, { maxAge: 60000 });
  const scope = "public_repo";

  const githubOauthUrl = `${authorize_uri}?client_id=${clientId}&scope=${scope}&redirect_uri=${redirectUri}&state=${csrfState}`;

  res.redirect(githubOauthUrl);
});

app.get("/oauth/redirect", (req, res) => {
  console.log("redirect back from github");
  const { code, state } = req.query;
  const { userId, csrfState, canvaState } = req.cookies;

  if (state && csrfState && state !== csrfState) {
    res.status(422).send(`Invalid state: ${csrfState} != ${state}`);
    return;
  }

  axios({
    method: "post",
    url: `https://github.com/login/oauth/access_token?client_id=${clientId}&client_secret=${clientSecret}&code=${code}`,
    headers: {
      accept: "application/json",
    },
  })
    .then((response) => {
      if (response.data.error) {
        throw new Error("Error while authenticating");
      }
      const accessToken = response.data.access_token;
      user.setUserToken(userId, accessToken);
      res.redirect(
        `https://canva.com/apps/configured?success=true&state=${canvaState}`
      );
    })
    .catch(() => {
      console.log("Sth went wrong");
      res.redirect(`https://canva.com/apps/configured?success=false`);
    });
});

// listen for requests :)
var listener = app.listen(process.env.PORT, () => {
  console.log(`Your app is listening on port ${listener.address().port}`);
});
