//Deployment Script
var cmd = require('node-cmd'),
    fs = require('fs'),
    path = require('path'),
    node_ssh = require('node-ssh'),
    ssh = new node_ssh();

//Configuration
var repo = 'starter-node-angular';
var repoPath = 'https://github.com/Xuroth/starter-node-angular.git';
var remotePath = '/home/ubuntu';
var server = '18.221.127.143';
var username = 'ubuntu';
var pemFile = 'hs-key.pem';
var manualFiles = [

];

function main() {
    console.log('Deployment Started.');
    cloneRepo();
}

function cloneRepo() {
    console.log(`Cloning Repo "${repo}"`);
    
    cmd.get(`rm -rf ${repo} && git clone ${repoPath}`, (err, data, stderr) => {
        console.log(`cloneRepo Callback\n\t err: ${err}\n\t data: ${data}\n\t stderr: ${stderr}`);
        if (err == null){
            sshConnect();
        }
    });
}

function transferProjectToRemote(failed, successful) {
    return ssh.putDirectory(__dirname + `/${repo}`, `${remotePath}/${repo}-temp`, {
        recursive: true,
        concurrency: 1,
        validate: (itemPath) => {
            const baseName = path.basename(itemPath);
            console.log('Basename is '+baseName);
            if (manualFiles.indexOf(baseName) > -1){
                console.log(`Required file: "${baseName}" found!`);
                // throw new Error(baseName);
                return true;
            } else if(baseName.substr(0,1) !== '.' && baseName !== 'node_modules') {
                return true;
            } else {
                return false;
            }
            // return baseName in manualFiles || (baseName.substr(0,1) !== '.' && baseName !== 'node_modules')
        },
        tick: (localPath, remote, error) => {
            if (error) {
                failed.push(localPath);
                console.log(`Failed to transfer "${localPath}"`);
            } else {
                successful.push(localPath);
                console.log(`Successfully transferred "${localPath}" to "${remote}"`);
            }
        }
    })
}

function createRemoteTempFolder() {
    console.log('Creating temp directory on remote host.');
    return ssh.execCommand(`rm -rf ${repo}-temp && mkdir ${repo}-temp`, {cwd: remotePath});
}

function stopRemoteServices() {
    console.log(`Stopping remote services on host`);
    return ssh.execCommand(`npm stop && sudo service mongod stop`, {cwd: remotePath});
}

function updateRemoteApp() {
    console.log('Updating files on host');
    return ssh.execCommand(`mkdir -p ${repo} && shopt -s dotglob && cp -rT ${repo}-temp/. ${repo}/ && rm -rf ${repo}-temp/*`, {cwd: remotePath});
}

function restartRemoteServices() {
    console.log('Restarting remote services on host');
    return ssh.execCommand('npm start && sudo service mongod start', {cwd: remotePath+'/'+repo});
}

function sshConnect() {
    console.log(`Establishing connection to remote server: ${server}`);
    ssh.connect({
        host: server,
        username: username,
        privateKey: pemFile
    })
    .then( () => {
        console.log(`Connection to remote server established.`);
        return createRemoteTempFolder();
    })
    .then( (result) => {
        const failed = [];
        const successful = [];
        if (result.stdout) { console.log(`STDOUT: ${result.stdout}`); }
        if (result.stderr) {
            console.log(`STDERR: ${result.stderr}`);
            return Promise.reject(result.stderr);
        }
        return transferProjectToRemote(failed, successful);
    })
    .then( (status) => {
        if (status) {
            return stopRemoteServices();
        } else {
            return Promise.reject(failed.join(', '));
        }
    })
    .then( (status) => {
        if (status) {
            return updateRemoteApp();
        } else {
            return Promise.reject(failed.join(', '));
        }
    })
    .then( (status) => {
        if (status) {
            return restartRemoteServices();
        } else {
            return Promise.reject(failed.join(', '));
        }
    })
    .then( () => {
        console.log('Deployment complete.');
        process.exit(0);
    })
    .catch( e=> {
        console.log(e);
        process.exit(1);
    })
}

main();