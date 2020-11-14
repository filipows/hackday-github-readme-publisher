// TODO: handle signature verification

const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const app = express();
const fs = require("fs");
const GithubUploader = require('./github-uploader.js');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;

app.use(express.static("public"));

const USERS = {};

function isAuthenticated(userId) {
    return USERS[userId] && USERS[userId].accessToken;
}

app.post("/publish/resources/upload", async (request, response) => {
    const userId = request.body.user;
    const imgUrl = request.body.assets[0].url;
    const imgName = request.body.assets[0].name;

    if (!isAuthenticated(userId)) {
        console.log(`user ${userId} was not authenticated`)
        return response.send({
            type: "ERROR",
            errorCode: "CONFIGURATION_REQUIRED"
        });
    }

    console.log('publish', request.body, request.query)
    const uploader = new GithubUploader(USERS[userId].accessToken);
    const urlToProfileRepo = await uploader.upload(imgUrl, imgName);


    response.send({
        type: "SUCCESS",
        url: urlToProfileRepo
    });
});

app.post("/configuration", async (request, response) => {
    console.log("configuration request body", request.body);
    const userId = request.body.user;

    if (isAuthenticated(userId)) {
        // TODO: Check with Github if token is still valid
        response.send({
            type: "SUCCESS",
            labels: ["PUBLISH"]
        });
    } else {
        response.send({
            type: "ERROR",
            errorCode: "CONFIGURATION_REQUIRED"
        });
    }
});

app.get("/redirect", (req, res) => {
    // console.log("redirect req.body", req.body);
    const userId = req.query.user;
    const canvaState = req.query.state;
    USERS[userId] = {
        canvaState
    };

    const authorize_uri = "https://github.com/login/oauth/authorize";
    const redirectUri =
        `https://hackday-github-profile-pic.glitch.me/oauth/redirect?userId=${userId}`;
    const state = 'ABACDESAFASFDADFADF'; // TODO: handle state verification
    const scope = 'public_repo'

    const githubOauthUrl = `${authorize_uri}?client_id=${clientId}&scope=${scope}&redirect_uri=${redirectUri}&state=${state}`;

    res.redirect(githubOauthUrl);
});

app.get("/oauth/redirect", (req, res) => {
    console.log("redirect back from github");
    const userId = req.query.userId; // Probably better to use state
    const requestToken = req.query.code;
    axios({
        method: "post",
        url: `https://github.com/login/oauth/access_token?client_id=${clientId}&client_secret=${clientSecret}&code=${requestToken}`,
        headers: {
            accept: "application/json"
        }
    })
        .then(response => {
            if (response.data.error) {
                throw new Error('Error while authenticating')
            }
            const accessToken = response.data.access_token;
            const canvaState = USERS[userId].canvaState;
            USERS[userId] = {
                accessToken
            };
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