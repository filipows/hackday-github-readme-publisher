// @ts-check

const { Octokit } = require("@octokit/rest");
const glob = require("globby");
const path = require("path");
const { readFile, remove } = require("fs-extra");
const fs = require("fs");
const { promisify } = require("util");
const rimraf = require("rimraf");

const COMMIT_MESSAGE = "Uploaded by Canva";
const PROFILE_FOLDER_PREFIX = "profile_repo_";

class GithubUploader {
  constructor(token) {
    this.token = token || token;

    this.octo = new Octokit({
      auth: token,
    });

    console.log("created uploader");
  }

  async upload(imgUrl, imgName) {
    console.log("uploading", imgUrl, imgName);

    const {
      data: { login: username },
    } = await this.octo.users.getAuthenticated();

    const repoName = username;

    const { data: repos } = await this.octo.repos.listForUser({
      username,
    });
    console.log(
      "repos",
      repos.map((repo) => repo.name)
    );

    if (!repos.map((repo) => repo.name).includes(repoName)) {
      await this.createRepo(repoName);
      console.log("created repo");
    }
    const tmpLocalRepoPath = await this.createTmpLocalRepoWithReadme(
      imgUrl,
      imgName
    );
    await this.uploadToRepo(
      tmpLocalRepoPath,
      repoName,
      username,
      COMMIT_MESSAGE
    );
    console.log("uploaded to repo");
    await this.removeTmpRepoFolder(tmpLocalRepoPath);

    return `https://github.com/${username}/${username}`;
  }

  async createTmpRepoFolder() {
    const tmpPath = PROFILE_FOLDER_PREFIX + Date.now();
    await promisify(fs.mkdir)(tmpPath, { recursive: true });

    return tmpPath;
  }

  async createReadmeFile(folderPath, content) {
    const filePath = `${folderPath}/README.md`;
    return promisify(fs.writeFile)(filePath, content);
  }

  async removeTmpRepoFolder(pathToRemove) {
    return remove(pathToRemove);
  }

  async createTmpLocalRepoWithReadme(imgUrl, name) {
    const tmpLocalRepoPath = await this.createTmpRepoFolder();

    const readmeContent = `![alt text](${imgUrl} "${name}")`;
    this.createReadmeFile(tmpLocalRepoPath, readmeContent);

    return tmpLocalRepoPath;
  }

  async uploadToRepo(fPath, repo, repoOwner, commitMessage, branch) {
    if (!branch) {
      const { data: repoDetails } = await this.octo.repos.get({
        owner: repoOwner,
        repo,
      });
      branch = repoDetails.default_branch;
    }

    const currentCommit = await this.getCurrentCommit(repoOwner, repo, branch);
    const filesPaths = await glob(fPath);
    const filesBlobs = await Promise.all(
      filesPaths.map(this.createBlobForFile(repoOwner, repo))
    );
    const pathsForBlobs = filesPaths.map((fullPath) =>
      path.relative(fPath, fullPath)
    );
    const newTree = await this.createNewTree(
      repoOwner,
      repo,
      filesBlobs,
      pathsForBlobs,
      currentCommit.treeSha
    );
    const newCommit = await this.createNewCommit(
      repoOwner,
      repo,
      commitMessage,
      newTree.sha,
      currentCommit.commitSha
    );
    await this.setBranchToCommit(repoOwner, repo, branch, newCommit.sha);
  }

  async getCurrentCommit(owner, repo, branch) {
    console.log("getting latest");
    const { data: refData } = await this.octo.git.getRef({
      owner,
      repo,
      ref: `heads/${branch}`,
    });
    const commitSha = refData.object.sha;
    const { data: commitData } = await this.octo.git.getCommit({
      owner,
      repo,
      commit_sha: commitSha,
    });
    return {
      commitSha,
      treeSha: commitData.tree.sha,
    };
  }

  async createRepo(repo) {
    return this.octo.repos.createForAuthenticatedUser({
      name: repo,
      auto_init: true,
    });
  }

  getFileAsUTF8(filePath) {
    return readFile(filePath, "utf8");
  }

  createBlobForFile(org, repo) {
    return async (filePath) => {
      const content = await this.getFileAsUTF8(filePath);
      const blobData = await this.octo.git.createBlob({
        owner: org,
        repo,
        content,
        encoding: "utf-8",
      });
      return blobData.data;
    };
  }

  async createNewTree(owner, repo, blobs, paths, parentTreeSha) {
    // custom config
    const tree = blobs.map(({ sha }, index) => ({
      path: paths[index],
      mode: `100644`,
      type: `blob`,
      sha,
    }));
    const { data } = await this.octo.git.createTree({
      owner,
      repo,
      tree,
      base_tree: parentTreeSha,
    });
    return data;
  }

  async createNewCommit(org, repo, message, currentTreeSha, currentCommitSha) {
    return (
      await this.octo.git.createCommit({
        owner: org,
        repo,
        message,
        tree: currentTreeSha,
        parents: [currentCommitSha],
      })
    ).data;
  }

  setBranchToCommit(org, repo, branch, commitSha) {
    return this.octo.git.updateRef({
      owner: org,
      repo,
      ref: `heads/${branch}`,
      sha: commitSha,
    });
  }
}

module.exports = GithubUploader;

// const token = '';
// const uploader = new GithubUploader(token);
// const imgUrl = 'https://picsum.photos/536/354';
// const name = 'Canva design name'
// uploader.upload(imgUrl, name);
