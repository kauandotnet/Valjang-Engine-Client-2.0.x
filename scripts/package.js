"use strict";

const fs = require("fs");
const execSync = require("child_process").execSync;
const path = require("path");

const rootPackage = JSON.parse(fs.readFileSync(path.join(__dirname, `/../package.json`), { encoding: "utf8" }));
const publicPackage = JSON.parse(fs.readFileSync(path.join(__dirname, `/../package.json`), { encoding: "utf8" }));
publicPackage.version = rootPackage.version;
publicPackage.dependencies = rootPackage.dependencies;

fs.writeFileSync(path.join(__dirname, `/../package.json`), JSON.stringify(publicPackage, null, 2) + "\n");

execSync("npm install --production", { cwd: `${__dirname}/../public`, stdio: "inherit" });

// Running rcedit@0.5.1 on Wine 1.4 tries to access the display server, making the build fail on Travis
// Wine 1.6 presumably works, but Travis currently doesn't allow installing it
// electron-packager@7.2.0 explicitely depends on rcedit@^0.5.1 so we can't use it.
// See https://github.com/electron-userland/electron-packager/issues/413
execSync("npm install rcedit@0.5.0 electron-packager@7.1.0", { stdio: "inherit" });

console.log("Running electron-packager...");

const packager = require("electron-packager");
const year = new Date().getFullYear();

packager({
    dir: "public",
    name: "ValjangEngine",
    all: true,
    version: publicPackage.ValjangEngine.electron,
    out: "packages",
    icon: "icons/ValjangEngine",
    asar: false,
    "app-bundle-id": "com.Valjang.ValjangEngine",
    "app-version": publicPackage.version,
    "version-string": {
        "CompanyName": "Valjang",
        "LegalCopyright": `Copyright © 2014-${year} Valjang`,
        "FileVersion": publicPackage.version,
        "FileDescription": "The HTML5 2D+3D game maker",
        "ProductName": "ValjangEngine",
        "ProductVersion": publicPackage.version
    }
}, (err, oldPaths) => {
    if (err) throw err;

    const buildPaths = [];
    for (const oldPath of oldPaths) {
        const newPath = oldPath
            .replace("ValjangEngine", `ValjangEngine-v${publicPackage.version}`)
            .replace("-darwin-", "-osx-")
            .replace("-win32-", "-win-");
        fs.renameSync(oldPath, newPath);
        buildPaths.push(newPath);
    }

    for (let buildPath of buildPaths) {
        const folderName = path.basename(buildPath);
        console.log(`Generating archive for ${folderName}.`);
        try {
            execSync(`zip --symlinks -r ${folderName}.zip ${folderName}`, { cwd: `${__dirname}/../packages` });
        } catch (err) {
            console.error(err.stack);
        }
    }

    publicPackage.version = "0.0.0-dev";
    delete publicPackage.dependencies;
    fs.writeFileSync(`${__dirname}/../public/package.json`, JSON.stringify(publicPackage, null, 2) + "\n");
    execSync("npm prune", { cwd: `${__dirname}/../public`, stdio: "inherit" });

    console.log("Done.");
});