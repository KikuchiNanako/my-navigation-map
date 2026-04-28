//let frequentPoints = [];
//let allPoints = [];
//let map;
//let gpxProcessed = false;
//let directionsService;
//let directionsRenderer;
//let frequentCircles = [];
//let currentLocationMarker;
//let watchId = null;
//let navigationTimer = null;







async function startRouteCheck() {
    await requestDeviceOrientation();
    
    if (!gpxProcessed) {
        logMessage("エラー");
        return;
    }

    const destinationPlace = document.getElementById(`destinationInput`).value.trim();
    if (!destinationPlace) {
        logMessage("エラー: 目的地を入力してください");
        return;
    }

    let currentLatLon = await getApproximateLocation();
    
    if(directionsRenderer) {
        directionsRenderer.setDirections({ routes: [] });
    }

    if (!currentLatLon && allPoints.length > 0) {
        logMessage("現在地の取得に失敗しました");
        currentLatLon = { lat: allPoints[0].lat, lng: allPoints[0].lon };
        } else if (!currentLatLon) {
            logMessage("エラー:現在地を取得できませんでした");
            return;
        }

        const { lat: currentLat, lng: currentLon } = currentLatLon;
        const destinationLatLon = await getCoordinatesFromPlace(destinationPlace);

        if (!destinationLatLon) {
            logMessage("\nエラー:目的地の座標を獲得できませんでした");
            return;
        }

        if (isOutsideRoute(currentLat, currentLon)) {
            logMessage("経路外です");
            displayRoute(currentLatLon, destinationLatLon);
            drawMap();

            updateNavDisplay("ルートを確認してください", "開始ボタンを押すと案内を始めます", "#2c3e50");
        } else {
            logMessage("経路内です");
            drawMap();

            updateNavDisplay("よく通る道です", "案内を休止しています")

            if (watchId === null) {
                watchId = navigation.geolocation.watchPosition(
                    onPositionUpdate,
                    (error) => logMessage(`位置監視エラー: ${error.message}`),
                    {
                        enableHighAccuracy: true,
                        timeout: 5000,
                        maximumAge: 0
                    }
                );
                logMessage("現在地の保存を開始しました");
            }
        }
 }

 function checkCurrentLocation(lat, lon) {
    const outside = isOutsideRoute(lat, lon);

    if (outside && !NavigationActivation) {
        logMessage("知らない道に出ました。ナビを開始します");
        startRouteCheck();
    } else if (!outside) {
        logMessage("経路内を走行中");
    }
 }
