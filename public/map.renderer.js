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

    //Directions関連の初期化
    directionsService = new google.maps.DirectionsService();
    directionsRenderer = new google.maps.DirectionsRenderer({
        map: map,
        suppressMarkers: true,
        suppressPolylines: true
    });

    //現在地マーカーの更新
    if (typeof updateCurrentLocationMarker === 'function') {
        updateCurrentLocationMarker(initialLocation, 0, false);
    }

    //マップクリックイベントの設定
    map.addListener("click", async (e) => {
        const panel = document.getElementById("map-bottom-panel");

        if (!e.placeId && window.tempMarker) {
            window.tempMarker.setMap(null);
            window.tempMarker = null;

            if (panel) {
                panel.style.display = "none";
            } return;
        }

        if (window.tempMarker) {
            window.tempMarker.setMap(null);
        }
        if (window.currentInfoWindow) {
            window.currentInfoWindow.close();
        }

        const lat = e.latLng.lat();
        const lng = e.latLng.lng();

        window.tempMarker = new google.maps.Marker({
            position: e.latLng,
            map: map,
            icon: "http://maps.google.co.jp/mapfiles/ms/icons/red-dot.png"
        });

        const geocoder = new google.maps.Geocoder();
        geocoder.geocode({ location: e.latLng }, (results, status) => {
            let addressText = "選択した位置";
            if (status === google.maps.GeocoderStatus.OK && results && results.length > 0) {
                addressText = results[0].formatted_address.replace(/^日本、/, '');
            } else {
                addressText = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
            }

            const addressDiv = document.getElementById("bottom-panel-address");
            const btn = document.getElementById("bottom-panel-btn");

            if (panel && addressDiv && btn) {
                addressDiv.innerText = addressText;
                panel.style.display = "block";

                const newBtn = btn.cloneNode(true);
                btn.parentNode.replaceChild(newBtn, btn);

                newBtn.addEventListener("click", () => {
                    setAsDestination(lat, lng);
                    panel.style.display = "none";
                });
            }
        });        
    });

    //ドラッグ操作のイベントリスナー
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

    //目的地入力補完
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

    //すべての初期化が終わった後にdrawmapを呼び出す
    const pointsToDraw = window.frequentPoints || frequentPoints;
    if (pointsToDraw && pointsToDraw.length > 0 && typeof drawMap === 'function') {
        drawMap();
    }
 }

 
 /**
  * 吹き出しのボタンが押されたときに、正式に目的地としてセットする関数
  */
 function setAsDestination(lat, lng) {
    if (window.tempMarker) {
        window.tempMarker.setMap(null);
        window.tempMarker = null;
    }

    if (destinationMarker) {
        destinationMarker.setMap(null);
    }

    const latLng = new google.maps.LatLng(lat, lng);

    destinationMarker = new google.maps.Marker({
        position: latLng,
        map: map,
        icon: "http://maps.google.co.jp/mapfiles/ms/icons/blue-dot.png"
    });

    const geocoder = new google.maps.Geocoder();

    geocoder.geocode({ location: latLng }, (results, status) => {
        const input = document.getElementById("destinationInput");
        if (status === google.maps.GeocoderStatus.OK && results.length > 0) {
            if (input) input.value = results[0].formatted_address;
            logMessage(`地図タップから目的地を設定： ${results[0].formatted_address}`);
        } else {
            if (input) input.value = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
            logMessage(`地図タップから目的地を設定：座標 (${lat}, ${lng})`);
        }
    });
        
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

//描画したポリラインを管理する配列（クリア用）
let frequentPolylines = [];

async function drawMap() {
    if (!map) return;

    //過去に描画した線があれば地図から削除してクリア
    frequentPolylines.forEach(p => p.setMap(null));
    frequentPolylines = [];

    //よく通る道のデータがなければ何もしない
    if (!window.frequentPoints || window.frequentPoints.length === 0) {
        logMessage("描画するよく通る道のデータがありません");
        return;
    }

    const rawPoints = window.frequentPoints;
    const mergedPoints = mergeNearbyPoints(rawPoints, 20);

    logMessage(`よく通る道の線描画を開始します...(データ数: ${window.frequentPoints.length})`);

    const key = window.MAPS_API_KEY || (typeof apiKey !== 'undefined' ? apiKey : null);
    if (!key) {
        logMessage("APIエラー");
        return;
    }

    //Roads APIは一度に100点までしか処理できないため、100点ずつの塊（チャンク）に分ける
    const chunkSize = 100;
    for (let i = 0; i < mergedPoints.length; i += chunkSize ) {
        const chunk = mergedPoints.slice(i, i + chunkSize);
        
        const pathString = chunk.map(p => `${p.lat_r},${p.lon_r}`).join('|');

        const url = `https://roads.googleapis.com/v1/snapToRoads?path=${pathString}&interpolate=false&key=${key}`;

        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`APIエラー: ${response.status}`);

            const data = await response.json();

            if (data.snappedPoints && data.snappedPoints.length > 0) {
                data.snappedPoints.forEach(sp => {
                    const lat = sp.location.latitude;
                    const lng = sp.location.longitude;

                    const polyline = new google.maps.Polyline({
                    path: [
                        { lat: lat, lng: lng},
                        { lat: lat + 0.0001, lng: lng + 0.0001 }
                    ],
                    map: map,
                    strokeColor: "#ff0000",
                    strokeOpacity: 0.6,
                    strokeWeight: 5,
                    clickable: false
                });

                frequentPolylines.push(polyline);
            });
        }
    } catch (e) {
            console.error(`Roads APIエラー（分割 ${i+1}）:`, e);
            logMessage(`一部の区間の線描画に失敗しました: ${e.message}`);
        }
    }

    logMessage("よく通る道の線描画が完了しました");
}  
    /*
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
*/

 /**
 * マップ上の頻度ポイントの円をすべてクリアする
 */
function clearFrequentCircle() {
    if (typeof frequentCircles !== 'undefined' && frequentCircles.length > 0) {
        frequentCircles.forEach(circle => circle.setMap(null));
        frequentCircles = [];
        logMessage("以前の頻度ポイントを地図からクリアしました");
    }
}

window.alternativePolylines = [];
window.selectedRouteIndex = 0;

function displayRoute(origin, destination){
    clearAlternativePolylines();

    if (typeof clearRoutePolylines === 'function') {
        clearRoutePolylines();
    }

    if (typeof navigationActive !== 'undefined') {
        navigationActive = false;
    }

    if (typeof destinationMarker !== 'undefined' && destinationMarker) {
        destinationMarker.setMap(null);
        destinationMarker = null;
    }

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
                        strokeColor: isSelected ? "#4285F4" : "#4254F4",
                        strokeOpacity: isSelected ? 0.8 : 0.4,
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
                renderRouteStepsList(0);

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
            strokeColor: isSelected ? "#4285F4" : "#4285F4",
            strokeOpacity: isSelected ? 0.8 : 0.4,
            strokeWeight: isSelected ? 6 : 4,
            zIndex: isSelected ? 2 : 1
        });
    });

    updateRouteInfoUI(index);

    renderRouteStepsList(index);

    logMessage(`ルート ${index + 1} が選択されました`);
}

/**
 * 指定されたルートインデックスの全ステップをHTMLに書き出す
 * @param {number} routeIndex
 */
function renderRouteStepsList(routeIndex) {
    const response = window.lastDirectionsResponse;
    if (!response || !response.routes[routeIndex]) return;

    const route = response.routes[routeIndex];
    if (!route) return;

    let legs = [];
    if (typeof route.getLegs === 'function'){
        legs = route.getLegs();
    } else if (route.legs) {
        legs = route.legs;
    }

    const leg = route.legs[0];
    if (!leg) return;

    let steps = [];
    if (typeof leg.getSteps === 'function') {
        steps = leg.getSteps();
    } else if (leg.steps) {
        steps = leg.steps;
    }

    const listElement = document.getElementById("routeStepsList");
    const containerElement = document.getElementById("routeStepsContainer");

    if (listElement && containerElement) {
        listElement.innerHTML = "";

        console.log(`---ルートの全ステップ詳細---`, steps);

        if (!steps || steps.length === 0) {
            listElement.innerHTML = "<li>ステップ情報が取得できませんでした。</li>";
            return;
        }

        steps.forEach((step, idx) => {
            const li = document.createElement("li");
            li.style.marginBottom = "10px";
            li.style.fontSize = "14px";
            li.style.color = "#333";



            const cleanInstruction = (step.instructions || "").replace(/<[^>]*>/g, "");

            const distance = (step.distance && step.distance.text) ? step.distance.text : "";
            const duration = (step.duration && step.duration.text) ? step.duration.text : "";

            li.innerHTML = `<strong>${cleanInstruction}</strong> <span style="color: #666; font-size: 12px;">(${distance} / ${duration}</span>)`;
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

/**
 * 全てのナビゲーション情報を完全に消去してリセットする
 */
function clearAllNavigation() {
    if (window.tempMarker) {
        window.tempMarker.setMap(null);
        window.tempMarker = null;
    }

    if (typeof destinationMarker !== 'undefined' && destinationMarker) {
        destinationMarker.setMap(null);
        destinationMarker = null;
    }

    if (typeof clearAlternativePolylines === 'function') {
        clearAlternativePolylines();
    }

    if (typeof directionsRenderer !== 'undefined' && directionsRenderer) {
        directionsRenderer.setDirections({ routes: [] });
    }

    const input = document.getElementById("destinationInput");
    if (input) {
        input.value = "";
    }

    const bottomPanel = document.getElementById("map-bottom-panel");
    if (bottomPanel) {
        bottomPanel.style.display = "none";
    }

    const stepsContainer = document.getElementById("routeStepsContainer");
    if (stepsContainer) {
        stepsContainer.style.display = "none";
    }

    if (typeof NavigationActive !== 'undefined') {
        navigationActive = false;
    }
    if (typeof clearRoutePolylines === 'function') {
        clearRoutePolylines();
    }

    const navPanel = document.getElementById("nav-panel");
    if (navPanel) {
        navPanel.style.display = "none";
    }

    const statusLabel = document.getElementById("statusLabel");
    if (statusLabel) {
        statusLabel.innerText = "状態：待機中";
    }

    logMessage("すべての目的地、ピン、経路、および画面表示をリセットしました");
}

/**
 * 目的地入力欄のオールデリートボタンが押されたときの処理
 */
function clearDestinationInputOnly() {
    const input = document.getElementById("destinationInput");
    if (input) {
        input.value = "";
        input.focus();
    }
    logMessage("目的地の文字入力をクリアしました");

}