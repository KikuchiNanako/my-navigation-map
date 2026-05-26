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
        zoom: 15,
        gestureHandling: "greedy",
        disableDefaultUI: false,
        mapId: "3d7b65239e3531fb68add898",
        heading: 0,
        tilt: 0,
        headingInteractionEnabled: true,
        titleInteractionEnabled: true
    });

    window.map = map;
    window.googleMapsReady = true;

    if (window.frequentPoints && window.frequentPoints.length > 0) {
        drawMap();
    }

    directionsService = new google.maps.DirectionsService();
    directionsRenderer = new google.maps.DirectionsRenderer({
        map: map,
        suppressMarkers: true,
        suppressPolylines: true
    });

    updateCurrentLocationMarker(initialLocation, 0, false);

    map.addListener("click", async (e) => {
        const geocoder = new google.maps.Geocoder();

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

    map.addListener('drag', () => {
        isUserInteracting = true;

        if (interactionTimeout) {
            clearTimeout(interactionTimeout);
        }
    });

    map.addListener('dragend', () => {
        if (interactionTimeout) clearTimeout(interactionTimeout);

        interactionTimeout = setTimeout(() => {
            isUserInteracting = false;
            logMessage("回転を再開します");
        }, 4000);
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

 /**
  * 近い頻出点を統合する
  * @param {Array} points
  * @param {number} threshold 距離(m)
  * @returns {Array}
  */
 function mergeNearbyPoints(points, threshold = 20) {
    const merged = [];

    points.forEach(p => {
        const existing = merged.find(m => {
            const dist = getDistanceMeters(
                p.lat_r,
                p.lon_r,
                m.lat_r,
                m.lon_r
            );

            return dist < threshold;
        });

        if (!existing) {
            merged.push({
                lat_r: p.lat_r,
                lon_r: p.lon_r
            });
        }
    });

    return merged;
}

async function drawMap() {
    if (typeof map === 'undefined' || !map) {
        if (window.map) {
            map = window.map;
        } else {
            logMessage("可視化エラー：地図の初期化を待機中です");
            setTimeout(drawMap, 1000);
            return;
        }
    }

    const rawPoints = window.frequentPoints || [];
    const pts = window.allPoints || [];
    const fpts = mergeNearbyPoints(rawPoints, 20);

    if (pts.length === 0 && fpts.length === 0) {
        logMessage("可視化エラー：描画するデータがありません");
        return;
    }

    const currentpos = await getHybridLocation();
    if (currentpos) {
        map.setCenter(currentpos);
        map.setZoom(15);
    } else if (pts.length > 0) {
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
            strokeColor: "#ff0000",
            strokeOpacity: 0,
            strokeWeight: 1,
            fillColor: "#ff0000",
            fillOpacity: 0.05,
            map: map,
            center: { lat: p.lat_r, lng: p.lon_r},
            radius: THRESHOLD_M,
            clickable: false,
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

window.alternativePolylines = [];
window.selectedRouteIndex = 0;

function displayRoute(origin, destination){
    clearAlternativePolylines();


    directionsService.route(
        {
            origin: origin,
            destination: destination,
            travelMode: google.maps.TravelMode.DRIVING,
            provideRouteAlternatives: true
        },
        (response, status) => {
            if (status === "OK" && response && response.routes && response.routes.length > 0) {
                const route = response.routes[0];

                window.lastDirectionsResponse = response;
                window.selectedRouteIndex = 0;

                directionsRenderer.setOptions({
                    suppressPolylines: true,
                    suppressMarkers: true,
                });

                console.log("===ルート確認用===");
                console.log(response);

                response.routes.forEach((route, routeIdx) => {

                    const path = [];
                    route.legs.forEach(leg => {
                        leg.steps.forEach(step => {
                            step.path.forEach(latLng => {
                                path.push(latLng);
                            });
                        });
                    });

                    const isSelected = (routeIdx === window.selectedRouteIndex);
                    const polyline = new google.maps.Polyline({
                        path: path,
                        map: map,
                        strokeColor: isSelected ? "#4285F4" : "9AA0A6",
                        strokeOpacity: isSelected ? 0.8 : 0.5,
                        strokeWeight: isSelected ? 6 : 4,
                        zIndex: isSelected ? 2 : 1
                    });

                    polyline.addListener('click', () => {
                        selectRoute(routeIdx);
                    });

                    window.alternativePolylines.push({
                        index: routeIdx,
                        polyline: polyline,
                        routeData: route
                    });
                });

                updateRouteInfoUI(0);
                renderRouteStgepsList(0);

                logMessage(`Google Maps 複数のルート (${response.routes.length}件)を表示しました`);

            } else {
                logMessage(`ルート検索に失敗しました: ${status}`);
                directionsRenderer.setDirections({ routes: [] });
                clearAlternativePolylines();

                const container = document.getElementById("routeStepsContainer");
                if (container) container.style.display = "none";
            }
        }
    );
}

/**
 * ユーザーが特定のルートを選択したときの処理
 */
function selectRoute(index) {
    if (!window.lastDirectionsResponse) return;
    window.selectedRouteIndex = index;

    window.alternativePolylines.forEach(item => {
        const isSelected = (item.index === index);
        item.polyline.setOptions({
            strokeColor: isSelected ? "#4285F4" : "#9AA0A6",
            strokeOpacity: isSelected ? 0.8 : 0.5,
            strokeWeight: isSelected ? 6 : 4,
            zIndex: isSelected ? 2 : 1
        });
    });

    updateRouteInfoUI(index);

    renderRouteStgepsList(index);

    logMessage(`ルート ${index + 1} が選択されました`);
}

/**
 * 指定されたルートインデックスの全ステップをHTMLに書き出す
 * @param {number} routeIndex
 */
function renderRouteStgepsList(routeIndex) {
    const response = window.lastDirectionsResponse;
    if (!response || !response.routes[routeIndex]) return;

    const route = response.routes[routeIndex];
    const leg = route.legs[0];
    if (!leg || !leg.steps) return;

    const listElement = document.getElementById("routeStepsList");        const containerElement = document.getElementById("routeStepsContainer");

    if (listElement && containerElement) {
        listElement.inneerHTML = "";

        leg.steps.forEach((step, idx) => {
            const li = document.createElement("li");
            li.style.marginBottom = "10px";
            li.style.fontSize = "14px";
            li.style.color = "#333";

            const cleanInstruction = (step.instructions || "").replace(/<[^>]*>/g, "");
            const distance = step.distance.text;
            const duration = step.duration.text;

            li.innnerHTML = `<strong>${cleanInstruction}</strong> <span style="color: #666; font-size: 12px;">(${distance} / ${duration}</span>)`;
            listElement.appendChild(li);
        });

        containerElement.style.display = "block";
    }
}


/**
 * ルート情報をUIに更新する共通処理
 */
function updateRouteInfoUI(index) {
    const response = window.lastDirectionsResponse;
    if (!response || !response.routes[index]) return;

    const route = response.routes[index];
    const leg = route.legs[0];
    if (!leg) return;

    const destinationInput = document.getElementById(`destinationInput`);
    const destinationPlace = destinationInput ? destinationInput.value.trim() : "目的地";
    const distanceText = leg.distance.text;
    const durationText = leg.duration.text;

    if ( typeof updateNavDisplay === 'function') {
        updateNavDisplay(
            `<span style="font-size: 22px; color: #ffffff; font-weight: bold; display: block; margin-bottom: 5px;"> 目的地： ${destinationPlace}</span>`,
            `<span style="font-size: 18px; color: #ffffff; font-weight: bold; display: block;">総距離 ${distanceText} / 所要時間 ${durationText}</span>`,
            "#2c3e50"
        );
    }
}

/**
 * 複数ルート用のポリラインをクリア
 */
function clearAlternativePolylines() {
    if (window.alternativePolylines && window.alternativePolylines.length > 0) {
        window.alternativePolylines.forEach(item => item.polyline.setMap(null));
        window.alternativePolylines = [];
    }
}