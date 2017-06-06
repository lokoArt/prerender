/*
* The goals of this cutomized S3 plugin
* 1. Allow specifying the minimum size that we need to keep in S3. It's convenient when Prerender fails to render the page correctly
* 2. Allow rerendering already saved pages in s3
* */

var cacheManager = require('cache-manager');
var s3 = new (require('aws-sdk')).S3({params:{Bucket: process.env.S3_BUCKET_NAME}});
var minDocumentLength = parseInt(process.env.S3_MIN_DOCUMENT_LENGTH, 10);
var rewritingStrategy = process.env.S3_REWRITING_STRATEGY;
/*
  S3_REWRITE_STRATEGY is one of these strings
    1. norewrite
    2. rewrite
*/

module.exports = {
    init: function() {
        this.cache = cacheManager.caching({
            store: s3_cache
        });
    },

    beforePhantomRequest: function(req, res, next) {
        if(req.method !== 'GET') {
            return next();
        }

        // drop the old cache only after successful render
        if (rewritingStrategy === 'rewrite') {
            return next();
        }

        this.cache.get(req.prerender.url, function (err, result) {

            if (!err && result) {
                console.log('cache hit');
                return res.send(200, result.Body);
            }

            next();
        });
    },

    afterPhantomRequest: function(req, res, next) {
        documentLength = req.prerender.documentHTML.toString().length;

        if(req.prerender.statusCode !== 200 || minDocumentLength > documentLength) {
            console.log('Skipping saving in s3 ' + req.prerender.url + ', the length is too small ' + documentLength);
            return next();
        }

        this.cache.set(req.prerender.url, req.prerender.documentHTML, function(err, result) {
            if (err) console.error(err);
            next();
        });

    }
};


var s3_cache = {
    get: function(key, callback) {
        if (process.env.S3_PREFIX_KEY) {
            key = process.env.S3_PREFIX_KEY + '/' + key;
        }

        s3.getObject({
            Key: key
        }, callback);
    },
    set: function(key, value, callback) {
        if (process.env.S3_PREFIX_KEY) {
            key = process.env.S3_PREFIX_KEY + '/' + key;
        }

        var request = s3.putObject({
            Key: key,
            ContentType: 'text/html;charset=UTF-8',
            StorageClass: 'REDUCED_REDUNDANCY',
            Body: value
        }, callback);

        if (!callback) {
            request.send();
        }
    }
};
