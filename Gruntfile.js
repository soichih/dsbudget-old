module.exports = function(grunt) {
    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),

        less: {
            lib: {
                options: {
                    compress: true,
                    yuicompress: true,
                    optimization: 2
                },
                files: {
                    "public/css/lib.css": "less/lib.less",
                }
            },

            dsbudget: {
                options: {
                    compress: true,
                    yuicompress: true,
                    optimization: 2,
                    cleancss: true,
                },
                files: {
                    "public/css/dsbudget.css": "less/dsbudget.less"
                }
            }
        },
        watch: {
            configFiles: {
                files: [ 'Gruntfile.js' ],
                options: {
                    reload: true
                }
            },
            lib_less: {
                files: "less/lib.less",
                tasks: ["less:lib"],
                options: {
                    spawn: false,
                }
            },
            dsbudget_less: {
                files: "less/*.less",
                tasks: ["less:dsbudget"],
                options: {
                    spawn: false,
                }
            }
        }
    });

    //grunt.loadNpmTasks('grunt-bower');
    //grunt.loadNpmTasks('grunt-contrib-concat');
    grunt.loadNpmTasks('grunt-contrib-uglify');
    grunt.loadNpmTasks('grunt-contrib-jshint');
    grunt.loadNpmTasks('grunt-contrib-less');
    grunt.loadNpmTasks('grunt-contrib-watch');

    //do everything if ran manually (or I can run watch for default..)
    //grunt.registerTask('default', [/*'bower',*/ 'jshint', 'concat', 'uglify', 'less']);
    grunt.registerTask('default', ['watch']);
};

