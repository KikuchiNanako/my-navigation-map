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

    const mapInstance = new google.maps.Map(document.getElementById("map"), {
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

    appState.map = mapInstance;

    //Directions関連の初期化
    appState.directionsService = new google.maps.DirectionsService();
    appState.directionsRenderer = new google.maps.DirectionsRenderer({
        map: mapInstance,
        suppressMarkers: true,
        suppressPolylines: true
    });

    //現在地マーカーの更新
    if (typeof updateCurrentLocationMarker === 'function') {
        updateCurrentLocationMarker(initialLocation, 0, false);
    }

    //マップクリックイベントの設定
    mapInstance.addListener("click", async (e) => {
        const panel = document.getElementById("map-bottom-panel");

        if (!e.placeId && appState.tempMarker) {
            appState.tempMarker.setMap(null);
            appState.tempMarker = null;

            if (panel) {
                panel.style.display = "none";
            } 
            return;
        }

        if (appState.tempMarker) {
            appState.tempMarker.setMap(null);
        }
        if (window.currentInfoWindow) {
            window.currentInfoWindow.close();
        }

        const lat = e.latLng.lat();
        const lng = e.latLng.lng();

        appState.tempMarker = new google.maps.Marker({
            position: e.latLng,
            map: mapInstance,
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
    mapInstance.addListener('drag', () => {
        appState.isUserInteracting = true;

        if (appState.interactionTimeout) {
            clearTimeout(appState.interactionTimeout);
        }
    });

    mapInstance.addListener('dragend', () => {
        if (appState.interactionTimeout) clearTimeout(appState.interactionTimeout);

        appState.interactionTimeout = setTimeout(() => {
            appState.isUserInteracting = false;
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
    const pointsToDraw = appState.frequentPoints;
    if (pointsToDraw && pointsToDraw.length > 0 && typeof drawMap === 'function') {
        drawMap();
    }
 }

 
 /**
  * 吹き出しのボタンが押されたときに、正式に目的地としてセットする関数
  */
 function setAsDestination(lat, lng) {
    if (appState.tempMarker) {
        appState.tempMarker.setMap(null);
        appState.tempMarker = null;
    }

    if (appState.destinationMarker) {
        appState.destinationMarker.setMap(null);
    }

    const latLng = new google.maps.LatLng(lat, lng);

    appState.destinationMarker = new google.maps.Marker({
        position: latLng,
        map: appState.map,
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
async function drawMap() {
    const currentMap = appState.map;

    if (!currentMap) {
        logMessage("地図インスタンスが未初期化のため、描画を待機します");
        return;
    }

    //過去に描画した線があれば地図から削除してクリア
    clearFrequentCircle();
    appState.frequentPolylines.forEach(p => p.setMap(null));
    appState.frequentPolylines = [];

    //よく通る道のデータがなければ何もしない
    if (!appState.frequentPoints || appState.frequentPoints.length === 0) {
        logMessage("描画するよく通る道のデータがありません");
        return;
    }

    const rawPoints = appState.frequentPoints;
    const mergedPoints = mergeNearbyPoints(rawPoints, 20);

    logMessage(`よく通る道の線描画を開始します...(データ数: ${appState.frequentPoints.length})`);

    const offset = 0.00015;

    mergedPoints.forEach(p => {
        const polyline = new google.maps.Polyline({
            path: [
                { lat: p.lat_r - offset, lng: p.lon_r - offset },
                { lat: p.lat_r + offset, lng: p.lon_r + offset }
            ],
            map: currentMap,
            strokeColor: "#ff0000",
            strokeOpacity: 0.7,
            strokeWeight: 5,
            clickable: false
        });

        appState.frequentPolylines.push(polyline);
        
    });


    logMessage("よく通る道の線描画が完了しました");
}  

 /**
 * マップ上の頻度ポイントの円をすべてクリアする
 */
function clearFrequentCircle() {
    if (appState.frequentCircles && appState.frequentCircles.length > 0) {
        appState.frequentCircles.forEach(circle => circle.setMap(null));
        appState.frequentCircles = [];
        logMessage("以前の頻度ポイントを地図からクリアしました");
    }
}

function displayRoute(origin, destination){
    const currentMap = appState.map;
    clearAlternativePolylines();

    if (typeof clearRoutePolylines === 'function') {
        clearRoutePolylines();
    }

    appState.navigationActive = false;
    

    if (appState.destinationMarker) {
        appState.destinationMarker.setMap(null);
        appState.destinationMarker = null;
    }

    appState.directionsService.route(
        {
            origin: origin,
            destination: destination,
            travelMode: google.maps.TravelMode.DRIVING,
            provideRouteAlternatives: true
        },
        (response, status) => {
            if (status === "OK" && response && response.routes && response.routes.length > 0) {
                const route = response.routes[0];

                appState.lastDirectionsResponse = response;
                appState.selectedRouteIndex = 0;

                appState.directionsRenderer.setOptions({
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

                    const isSelected = (routeIdx === appState.selectedRouteIndex);
                    const polyline = new google.maps.Polyline({
                        path: path,
                        map: currentMap,
                        strokeColor: isSelected ? "#4285F4" : "#4254F4",
                        strokeOpacity: isSelected ? 0.8 : 0.4,
                        strokeWeight: isSelected ? 6 : 4,
                        zIndex: isSelected ? 2 : 1
                    });

                    polyline.addListener('click', () => {
                        selectRoute(routeIdx);
                    });

                    appState.alternativePolylines.push({
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
                appState.directionsRenderer.setDirections({ routes: [] });
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
    if (!appState.lastDirectionsResponse) return;
    appState.selectedRouteIndex = index;

    appState.alternativePolylines.forEach(item => {
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
    const response = appState.lastDirectionsResponse;
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
    const response = appState.lastDirectionsResponse;
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
    if (appState.alternativePolylines && appState.alternativePolylines.length > 0) {
        appState.alternativePolylines.forEach(item => item.polyline.setMap(null));
        appState.alternativePolylines = [];
    }
}

/**
 * 全てのナビゲーション情報を完全に消去してリセットする
 */
function clearAllNavigation() {
    //タイマー・ポリライン・マーカー等のリセット
    appState.resetNavigation();

    //入力欄のリセット
    const input = document.getElementById("destinationInput");
    if (input) input.value = "";

    //ナビ案内上部パネルの非表示
    const navPanel = document.getElementById("nav-panel");
    if (navPanel) navPanel.style.display = "none";

    //ステップパネルの非表示と中身クリア
    const stepsContainer = document.getElementById("routeStepsContainer");
    const stepsList = document.getElementById("routeStepsList");
    if (stepsContainer) stepsContainer.style.display = "none";
    if (stepsList) stepsList.innerHTML = "";

    //状態ラベルのリセット
    const statusLabel = document.getElementById("statusLabel");
    if (statusLabel) {
        statusLabel.innerText = "状態：待機中";
        statusLabel.style.color = "#333";
    }

    //下部タップパネル
    const bottomPanel = document.getElementById("map-bottom-panel");
    if (bottomPanel) bottomPanel.style.display = "none";

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