const CACHE_NAME = "lepsa-ai-v1";

const FILES_TO_CACHE = [
    "./",
    "./index.html",
    "./script.js",
    "./manifest.json"
];


self.addEventListener(
    "install",
    function (event) {

        event.waitUntil(

            caches.open(
                CACHE_NAME
            ).then(function (cache) {

                return cache.addAll(
                    FILES_TO_CACHE
                );

            })

        );

        self.skipWaiting();

    }
);


self.addEventListener(
    "activate",
    function (event) {

        event.waitUntil(
            self.clients.claim()
        );

    }
);


self.addEventListener(
    "fetch",
    function (event) {

        event.respondWith(

            fetch(event.request)
                .catch(function () {

                    return caches.match(
                        event.request
                    );

                })

        );

    }
);