"use strict";

// Please keep variables alpha sorted please!
var concat = require("gulp-concat");
var config = require("./gulp-config.local.js")();
var cssmin = require("gulp-cssmin");
var debug = require("gulp-debug");
var foreach = require("gulp-foreach");
var fs = require('fs');
var gulp = require('gulp');
var msbuild = require("gulp-msbuild");
var newer = require("gulp-newer");
var nugetRestore = require('gulp-nuget-restore');
var rename = require("gulp-rename");
var runSequence = require("run-sequence");
var sass = require('gulp-sass');
var uglify = require("gulp-uglify");
var util = require("gulp-util");
var vinylNamed = require('vinyl-named'); // allows use of [name] in gulp-webpack output
var webpack = require("webpack");
var webpackConfig = require("./webpack-config.js")();
var webpackStream = require('webpack-stream'); // Webpack enabled for use mid-stream


var paths = {
    webroot: "./src"
};

paths.js = [
    
];
paths.minJs = paths.webroot + "/**/*.min.js";
paths.css = paths.webroot + "/Project/Website/code/styles/main.css";
paths.scss = paths.webroot + "/**/*.scss";
paths.minCss = paths.webroot + "/**/*.min.css";
paths.concatJsDest = paths.webroot + "/Project/Website/code/scripts/project/main.min.js";
paths.concatCssDest = paths.webroot + "/Project/Website/code/styles/project/site.min.css";
paths.scssDest = paths.webroot + "/Project/Website/code/styles/project/main";

var cssPaths = ['./foo/foo.scss', './bar/bar.scss'];

gulp.task('sass', function () {
    return gulp.src([paths.scss], { base: '.' })
        .pipe(sass()) // Using gulp-sass
        .pipe(gulp.dest("."));
});

gulp.task("min:css", function () {
    return gulp.src([paths.css, "!" + paths.minCss])
        .pipe(concat(paths.concatCssDest))
        .pipe(cssmin())
        .pipe(gulp.dest("."));
});

gulp.task("js", function () {
    webpackConfig.plugins = null;
    webpackConfig.devtool = "#inline-source-map";

    paths.js.forEach(function(jsPath) {
        return gulp.src([jsPath], { base: "."})
            .pipe(vinylNamed())
            .pipe(webpackStream(webpackConfig))
            .pipe(gulp.dest("."));
    });
});

gulp.task("min:js", function () {
    webpackConfig.plugins = [
        new webpack.optimize.UglifyJsPlugin({
            compress: { warnings: false },
            minimize: true
        })
    ];
    webpackConfig.devtool = "#source-map";
    return gulp.src([paths.js, "!" + paths.minJs], { base: "." })
        .pipe(vinylNamed())
        .pipe(webpackStream(webpackConfig))
        .pipe(gulp.dest("."));
});



gulp.task("deploy", function (callback) {
    config.runCleanBuilds = true;
    return runSequence(
        "02-Nuget-Restore",
        "03-Publish-All-Projects",
        "04-Apply-Xml-Transform",
        "06-Deploy-Transforms",
        callback);
});



gulp.task("02-Nuget-Restore", function (callback) {
    var solution = "./" + config.solutionName + ".sln";
    return gulp.src(solution).pipe(nugetRestore());
});


gulp.task("03-Publish-All-Projects", function (callback) {
    return runSequence(
        "Build-Solution",
        "Publish-Foundation-Projects",
        "Publish-Feature-Projects",
        "Publish-Project-Projects", callback);
});

gulp.task("04-Apply-Xml-Transform", function () {
    var layerPathFilters = ["./src/Foundation/**/*.transform", "./src/Feature/**/*.transform", "./src/Project/**/*.transform", "!./src/**/obj/**/*.transform", "!./src/**/bin/**/*.transform"];
    return gulp.src(layerPathFilters)
        .pipe(foreach(function (stream, file) {
            var fileToTransform = file.path.replace(/.+code\\(.+)\.transform/, "$1");
            util.log("Applying configuration transform: " + file.path);
            return gulp.src("./scripts/applytransform.targets")
                .pipe(msbuild({
                    targets: ["ApplyTransform"],
                    configuration: config.buildConfiguration,
                    logCommand: false,
                    verbosity: config.buildVerbosity,
                    stdout: true,
                    errorOnFail: true,
                    maxcpucount: config.buildMaxCpuCount,
                    nodeReuse: false,
                    toolsVersion: config.buildToolsVersion,
                    properties: {
                        Platform: config.buildPlatform,
                        WebConfigToTransform: config.websiteRoot,
                        TransformFile: file.path,
                        FileToTransform: fileToTransform
                    }
                }));
        }));
});



gulp.task("06-Deploy-Transforms", function () {
    return gulp.src("./src/**/code/**/*.transform")
        .pipe(gulp.dest(config.websiteRoot + "/temp/transforms"));
});

/*****************************
  Copy assemblies to all local projects
*****************************/
gulp.task("Copy-Local-Assemblies", function () {
    console.log("Copying site assemblies to all local projects");
    var files = config.sitecoreLibraries + "/**/*";

    var root = "./src";
    var projects = root + "/**/code/bin";
    return gulp.src(projects, { base: root })
        .pipe(foreach(function (stream, file) {
            console.log("copying to " + file.path);
            gulp.src(files)
                .pipe(gulp.dest(file.path));
            return stream;
        }));
});



/*****************************
  Publish
*****************************/
var publishStream = function (stream, dest) {
    var targets = ["Build"];

    return stream
        .pipe(debug({ title: "Building project:" }))
        .pipe(msbuild({
            targets: targets,
            configuration: config.buildConfiguration,
            logCommand: false,
            verbosity: config.buildVerbosity,
            stdout: true,
            errorOnFail: true,
            maxcpucount: config.buildMaxCpuCount,
            nodeReuse: false,
            toolsVersion: config.buildToolsVersion,
            properties: {
                Platform: config.publishPlatform,
                DeployOnBuild: "true",
                DeployDefaultTarget: "WebPublish",
                WebPublishMethod: "FileSystem",
                DeleteExistingFiles: "false",
                publishUrl: dest,
                _FindDependencies: "false"
            }
        }));
}

var publishProject = function (location, dest) {
    dest = dest || config.websiteRoot;

    console.log("publish to " + dest + " folder");
    return gulp.src(["./src/" + location + "/code/*.csproj"])
        .pipe(foreach(function (stream, file) {
            return publishStream(stream, dest);
        }));
}

var publishProjects = function (location, dest) {
    dest = dest || config.websiteRoot;

    console.log("publish to " + dest + " folder");
    return gulp.src([location + "/**/code/*.csproj"])
        .pipe(foreach(function (stream, file) {
            return publishStream(stream, dest);
        }));
};




gulp.task("Build-Solution", function () {

    var targets = ["Build"];
    if (config.runCleanBuilds) {
        targets = ["Clean", "Build"];
    }

    var solution = "./" + config.solutionName + ".sln";
    return gulp.src(solution)
        .pipe(msbuild({
            targets: targets,
            configuration: config.buildConfiguration,
            logCommand: false,
            verbosity: config.buildVerbosity,
            stdout: true,
            errorOnFail: true,
            maxcpucount: config.buildMaxCpuCount,
            nodeReuse: false,
            toolsVersion: config.buildToolsVersion,
            properties: {
                Platform: config.buildPlatform,
                SitecoreWebUrl: "",
                SitecoreDeployFolder: ""
            }
        }));
});



gulp.task("Publish-Foundation-Projects", function () {
    return publishProjects("./src/Foundation");
});

gulp.task("Publish-Feature-Projects", function () {
    return publishProjects("./src/Feature");
});

gulp.task("Publish-Project-Projects", function () {
    return publishProjects("./src/Project");
});

gulp.task("Publish-Project", function () {
    if (yargs && yargs.m && typeof (yargs.m) == 'string') {
        return publishProject(yargs.m);
    } else {
        throw "\n\n------\n USAGE: -m Layer/Module \n------\n\n";
    }
});

gulp.task("Publish-Assemblies", function () {
    var root = "./src";
    var binFiles = root + "/**/code/**/bin/SitecoreHone.*.{Feature,Foundation,Habitat}.*.{dll,pdb}";
    var destination = config.websiteRoot + "/bin/";
    return gulp.src(binFiles, { base: root })
        .pipe(rename({ dirname: "" }))
        .pipe(newer(destination))
        .pipe(debug({ title: "Copying " }))
        .pipe(gulp.dest(destination));
});

gulp.task("Publish-All-Views", function () {
    var root = "./src";
    var roots = [root + "/**/Views", "!" + root + "/**/obj/**/Views"];
    var files = "/**/*.cshtml";
    var destination = config.websiteRoot + "\\Views";
    return gulp.src(roots, { base: root }).pipe(
        foreach(function (stream, file) {
            console.log("Publishing from " + file.path);
            gulp.src(file.path + files, { base: file.path })
                .pipe(newer(destination))
                .pipe(debug({ title: "Copying " }))
                .pipe(gulp.dest(destination));
            return stream;
        })
    );
});

gulp.task("Publish-All-Configs", function () {
    var root = "./src";
    var roots = [root + "/**/App_Config", "!" + root + "/**/obj/**/App_Config"];
    var files = "/**/*.config";
    var destination = config.websiteRoot + "\\App_Config";
    return gulp.src(roots, { base: root }).pipe(
        foreach(function (stream, file) {
            console.log("Publishing from " + file.path);
            gulp.src(file.path + files, { base: file.path })
                .pipe(newer(destination))
                .pipe(debug({ title: "Copying " }))
                .pipe(gulp.dest(destination));
            return stream;
        })
    );
});


/******************************************/

gulp.task('watch', function () {
    gulp.watch(paths.scss, ['sass']);
    gulp.watch(paths.scss, ['min:js']);
    gulp.watch(paths.css, ['min:css']);
    // Other watchers
})




// Default Task Triggers Watch
gulp.task('default', function () {
    gulp.start('watch');
});

/******************************************/
// prevents Gulp from bombing out during pipes
function swallowError() {
    this.emit('end');
}