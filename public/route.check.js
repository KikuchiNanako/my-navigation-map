let frequentPoints = [];
let allPoints = [];
let map;
let gpxProcessed = false;
let directionsService;
let directionsRenderer;
let frequentCircles = [];
let currentLocationMarker;
let watchId = null;
let navigationTimer = null;







/**async function startRouteCheck() {
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

    clearFrequentCircle();

    if (!currentLatLon && allPoints.length > 0) {
        logMessage("現在地の取得に失敗しました");
        currentLatLon = { lat: allPoints[0].lat, lng: allPoints[0].lon };
        } else if (!currentLatLon) {
            logMessage("エラー:現在地を取得できませんでした");
            return;
        }

        const { lat: currentLat, lng: currentLon } = currentLatLon;
        logMessage(`現在地: ${currentLat.toFixed(5)}, ${currentLon.toFixed(5)}`);

        const destinationLatLon = await getCoordinatesFromPlace(destinationPlace);

        if (!destinationLatLon) {
            logMessage("\nエラー:目的地の座標を獲得できませんでした");
            return;
        }
        const { lat: destinationLat, lng: destinationLon } = destinationLatLon;
        logMessage(`目的地: ${destinationLat.toFixed(5)}, ${destinationLon.toFixed(5)}`);

        if (isOutsideRoute(currentLat, currentLon)) {
            logMessage("経路外です");
            
            map.setCenter(currentLatLon);

            new google.maps.Marker({
                position:currentLatLon,
                map: map,
                title: '現在地（経路外）',
                icon: {
                    url: 'http://maps.google.com/mapfiles/ms/icons/red-dot.png',
                }
            });

            new google.maps.Marker({
                position: destinationLatLon,
                map: map,
                title: '目的地',
                icon: {
                    url: 'http://maps.google.com/mapfiles/ms/icons/blue-dot.png',
                }
            });

            displayRoute(currentLatLon, destinationLatLon);
            map.setCenter(currentLatLon);
            map.setZoom(16);
        } else {
            logMessage("経路内です");

            if(directionsRenderer){
                directionsRenderer.setDirections({ routes: [] });
            }
        }
 }
*/