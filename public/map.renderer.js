 window.googleMapsReady = false;
 
 function initMap() {
    window.googleMapsReady = true;
    logMessage("GoogleMaps初期化完了");

    const initialLocation = { lat: 35.681236, lng: 139.767125 };

    map = new google.maps.Map(document.getElementById("map"), {
        center: initialLocation,
        zoom: 17,
        heading: 0,
        tilt: 0,
        //mapId: "DEMO_MAP_ID",
        gestureHandling: "greedy",
    });

    directionsService = new google.maps.DirectionsService();
    directionsRenderer = new google.maps.DirectionsRenderer({
        map: map,
        suppressMarkers: false,
        preserveViewport: true
    });
 }

  function drawMap() {
    const pts = window.allPoints || allPoints;
    const fpts = window.frequentPoints || frequentPoints;

    if (!map || !pts || pts.length === 0) {
        logMessage("可視化エラー：描画するデータがありません");
        return;
    }

    const avgLat = pts.reduce((sum, p) => sum + p.lat, 0) / pts.length;
    const avgLon = pts.reduce((sum, p) => sum + p.lon, 0) / pts.length;
    map.setCenter({ lat: avgLat, lng: avgLon });
    map.setZoom(14);

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