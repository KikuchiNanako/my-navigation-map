const { type } = require("express/lib/response");

 window.googleMapsReady = false;
 
 async function initMap() {
    window.googleMapsReady = true;
    logMessage("GoogleMaps初期化完了");

    let  initialLocation = { lat: 35.681236, lng: 139.767125 };

    try {
        const pos = await getHybridLocation();
        if (pos) {
            initialLocation = pos;
            logMessage("初期位置を現在地に設定");
        }
    } catch (e) {
        logMessage("現在地を取得できなかったのでデフォルト位置を表示");
    }

    map = new google.maps.Map(document.getElementById("map"), {
        center: initialLocation,
        zoom: 17,
        gestureHandling: "greedy",
        disableDefaultUI: false,
        mapId: "3d7b65239e3531fb68add898",
        heading: 0,
        tilt: 0
    });

    directionsService = new google.maps.DirectionsService();
    directionsRenderer = new google.maps.DirectionsRenderer({
        map: map,
        preserveViewport: true
    });

    map.addListener("click", async (e) => {
        const geocoder = new google.maps.Geocoder();

        //const lat = e.latLng.lat();
        //const lng = e.latLng.lng();

        geocoder.geocode({ location: e.latLng }, (results, status) => {
            if (status === "OK" && results[0]) {
                const address = results[0].formatted_address;

                const input = document.getElementById("destinationInput");
                if (input) {
                    input.value = address;
                    logMessage(`目的地をセットしました： ${address}`);
                } else {
                    console.error("destinationInputというIDの要素が見つかりません");
                }

                if(typeof destinationMarker !== 'undefined' && destinationMarker) {
                    destinationMarker.setMap(null);
                }

                destinationMarker = new google.maps.Marker({
                    position: e.latLng,
                    map: map,
                    icon: "http://maps.google.co.jp/mapfiles/ms/icons/blue-dot.png"
                });
            } else {
                logMessage("住所を取得できませんでした");

                if (typeof destinationMarker !== 'undefined' && destinationMarker) {
                    destinationMarker.setMap(null);
                }
                destinationMarker = new google.maps.Marker({
                    position: e.latLng,
                    map: map,
                    icon: "http://maps.google.co.jo/mapfiles/ms/icons/blue-dot.png"
                });

                const coords = `${e.latLng.lat().toFixed(6)}, ${e.latLng.lng().toFixed(6)}`;
                document.getElementById("destinationInput").value = coords;
            }
        });
    });

    map.addListener('dragstart', () => {
        isUserInteracting = true;
        logMessage("手動操作検知：回転を一時停止");
    });

    map.addListener('dragend', () => {
        if (interactionTimeout) clearTimeout(interactionTimeout);
        interactionTimeout = setTimeout(() => {
            isUserInteracting = false;
            logMessage("回転を再開します");
        }, 3000);
    });

    const input = document.getElementById("destinationInput");
    if (input) {
        const autocomplete = new google.maps.places.Autocomplete(input, {
        fields: ["geometry", "name", "formatted_address"],
        types: ["geocode", "establishment"]
        });

        autocomplete.addListener("place_changed", () => {
            const place = autocomplete.getPlace();
            logMessage("目的地が選択されました");
        });
    }

 }

async function drawMap() {
    const pts = window.allPoints || allPoints;
    const fpts = window.frequentPoints || frequentPoints;

    if (!map || !pts || pts.length === 0) {
        logMessage("可視化エラー：描画するデータがありません");
        return;
    }

    const currentpos = await getHybridLocation();
    if (currentpos) {
        map.setCenter(currentpos);
        map.setZoom(17);
    } else {
        const avgLat = pts.reduce((sum, p) => sum + p.lat, 0) / pts.length;
        const avgLon = pts.reduce((sum, p) => sum + p.lon, 0) / pts.length;
        map.setCenter({ lat: avgLat, lng: avgLon });
    }
  

    if (window.frequentCircles) {
        window.frequentCircles.forEach(circle => circle.setMap(null));
    }
    window.frequentCircles = [];

    if (fpts && fpts.length > 0) {
        fpts.forEach(p => {
            const circle = new google.maps.Circle({
            strokeColor: "red",
            strokeOpacity: 0.9,
            strokeWeight: 2,
            fillColor: "red",
            fillOpacity: 0.9,
            map: map,
            center: { lat: p.lat_r, lng: p.lon_r},
            radius: THRESHOLD_M,
        });
        window.frequentCircles.push(circle);
    });

    logMessage("地図に描画しました");
 }}

 /**
 * マップ上の頻度ポイントの円をすべてクリアする
 */
function clearFrequentCircle() {
    if (frequentCircles.length > 0) {
        frequentCircles.forEach(circle => circle.setMap(null));
        frequentCircles = [];
        logMessage("以前の頻度ポイントを地図からクリアしました");
    }
}

/**
 * 
 * @parm {{lat: number, lng: number}} origin 現在地
 * @parm {{lat: number, lng: number}} destination 目的地
 */
function displayRoute(origin, destination){
    directionsService.route(
        {
            origin: origin,
            destination: destination,
            travelMode: google.maps.TravelMode.DRIVING
        },
        (response, status) => {
            if (status === "OK" && response && response.routes && response.routes.length > 0) {
                const route = response.routes[0];

                window.lastDirectionsResponse = response;
                console.log("===ルート確認用===");
                console.log(response);

                const leg = route.legs && route.legs[0];
                if (!leg) {
                    console.warm("ルートは取得できましたが、legsがありません");
                    return;
                }

                console.log("出発地:", leg.start_address);
                console.log("目的地:", leg.end_address);
                console.log("距離:", leg.distance.text);
                console.log("所要時間:", leg.duration.text);
                console.log("ステップ数:", leg.steps.length);

                leg.steps.forEach((step, idx) => {
                    console.log(
                        `${idx + 1}: ${step.instructions.replace(/<[^>]*>/g, "")} (${step.distance.text}, ${step.duration.text})`
                    );
                });

                directionsRenderer.setDirections(response);
                logMessage("Google Maps ルートを表示しました");
                

            } else {
                logMessage(`ルート検索に失敗しました: ${status}`);
                directionsRenderer.setDirections({ routes: [] });
            }
        }
    );
}