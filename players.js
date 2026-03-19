document.addEventListener("DOMContentLoaded", function () {
    var storageKey = "spillere.subs";
    var matchStateKey = "spillere.matchState";
    var outfieldSlotCount = 8;
    var draggedPlayerId = null;

    var playerForm = document.getElementById("player-form");
    var playerNameInput = document.getElementById("player-name");
    var subsList = document.getElementById("subs-list");
    var subsDropzone = document.getElementById("subs-dropzone");
    var emptyState = document.getElementById("subs-empty-state");
    var keeperDropzone = document.getElementById("keeper-dropzone");
    var keeperSlot = document.getElementById("keeper-slot");
    var outfieldDropzone = document.getElementById("outfield-dropzone");
    var outfieldGrid = document.getElementById("outfield-grid");
    var startResumeButton = document.getElementById("start-resume-match");
    var pauseButton = document.getElementById("pause-match");
    var resetButton = document.getElementById("reset-match");
    var matchStatus = document.getElementById("match-status");

    if (!playerForm || !playerNameInput || !subsList || !emptyState || !keeperDropzone || !keeperSlot || !outfieldDropzone || !outfieldGrid) {
        return;
    }

    function createPlayerId() {
        return "player-" + Date.now() + "-" + Math.floor(Math.random() * 1000000);
    }

    function normalizeLocation(rawPlayer) {
        if (rawPlayer && (rawPlayer.location === "subs" || rawPlayer.location === "keeper" || rawPlayer.location === "outfield")) {
            return rawPlayer.location;
        }

        if (rawPlayer && rawPlayer.onPitch === true) {
            return "outfield";
        }

        return "subs";
    }

    function normalizePlayers(rawPlayers) {
        if (!Array.isArray(rawPlayers)) {
            return [];
        }

        return rawPlayers
            .filter(function (rawPlayer) {
                return rawPlayer && typeof rawPlayer.name === "string" && rawPlayer.name.trim() !== "";
            })
            .map(function (rawPlayer) {
                return {
                    id: typeof rawPlayer.id === "string" ? rawPlayer.id : createPlayerId(),
                    name: rawPlayer.name.trim(),
                    location: normalizeLocation(rawPlayer),
                    playingSeconds: Number.isFinite(rawPlayer.playingSeconds) ? Math.max(0, rawPlayer.playingSeconds) : 0,
                    lastStartedAt: Number.isFinite(rawPlayer.lastStartedAt) ? rawPlayer.lastStartedAt : null
                };
            });
    }

    function loadPlayers() {
        var savedPlayers = window.localStorage.getItem(storageKey);

        if (!savedPlayers) {
            return [];
        }

        try {
            return normalizePlayers(JSON.parse(savedPlayers));
        } catch (error) {
            console.error("Unable to parse saved players", error);
            return [];
        }
    }

    function savePlayers(players) {
        window.localStorage.setItem(storageKey, JSON.stringify(players));
    }

    function loadMatchState() {
        var savedMatchState = window.localStorage.getItem(matchStateKey);

        if (savedMatchState === "running" || savedMatchState === "paused") {
            return savedMatchState;
        }

        return "idle";
    }

    function saveMatchState(currentMatchState) {
        window.localStorage.setItem(matchStateKey, currentMatchState);
    }

    function clearStoredState() {
        var keysToRemove = [];
        var keyIndex = 0;

        for (keyIndex = 0; keyIndex < window.localStorage.length; keyIndex += 1) {
            var key = window.localStorage.key(keyIndex);

            if (key && key.indexOf("spillere.") === 0) {
                keysToRemove.push(key);
            }
        }

        keysToRemove.forEach(function (key) {
            window.localStorage.removeItem(key);
        });
    }

    function isOnPitch(player) {
        return player.location === "keeper" || player.location === "outfield";
    }

    function formatSeconds(totalSeconds) {
        var safeSeconds = Math.max(0, Math.floor(totalSeconds));
        var minutes = Math.floor(safeSeconds / 60);
        var seconds = safeSeconds % 60;

        return String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0");
    }

    function getRateMultiplier(player) {
        if (player.location === "keeper") {
            return 0.5;
        }

        return 1;
    }

    function getDisplayedSeconds(player) {
        if (!player.lastStartedAt) {
            return player.playingSeconds;
        }

        return player.playingSeconds + ((Date.now() - player.lastStartedAt) / 1000) * getRateMultiplier(player);
    }

    function findPlayer(playerId) {
        return players.find(function (player) {
            return player.id === playerId;
        });
    }

    function getKeeperPlayer() {
        return players.find(function (player) {
            return player.location === "keeper";
        });
    }

    function getOutfieldPlayers() {
        return players.filter(function (player) {
            return player.location === "outfield";
        });
    }

    function stopPlayerClock(player) {
        if (!player.lastStartedAt) {
            return;
        }

        player.playingSeconds = getDisplayedSeconds(player);
        player.lastStartedAt = null;
    }

    function startPlayerClock(player) {
        if (matchState !== "running" || !isOnPitch(player) || player.lastStartedAt) {
            return;
        }

        player.lastStartedAt = Date.now();
    }

    function syncClocksForMatchState() {
        players.forEach(function (player) {
            if (!isOnPitch(player)) {
                stopPlayerClock(player);
                return;
            }

            if (matchState === "running") {
                startPlayerClock(player);
            } else {
                stopPlayerClock(player);
            }
        });
    }

    function setPlayerLocation(player, nextLocation) {
        if (player.location === nextLocation) {
            return;
        }

        stopPlayerClock(player);

        player.location = nextLocation;

        if (matchState === "running" && isOnPitch(player)) {
            startPlayerClock(player);
        }
    }

    function updateTimerLabels() {
        var timerNodes = document.querySelectorAll(".player-time[data-player-id]");

        timerNodes.forEach(function (node) {
            var playerId = node.getAttribute("data-player-id");
            var player = findPlayer(playerId);

            if (!player) {
                return;
            }

            if (player.location === "subs") {
                node.textContent = "Bench | " + formatSeconds(getDisplayedSeconds(player));
                return;
            }

            if (player.location === "keeper") {
                node.textContent = "0.5x | " + formatSeconds(getDisplayedSeconds(player));
                return;
            }

            node.textContent = formatSeconds(getDisplayedSeconds(player));
        });
    }

    function clearDropHighlights() {
        keeperDropzone.classList.remove("drop-active");
        outfieldDropzone.classList.remove("drop-active");

        if (subsDropzone) {
            subsDropzone.classList.remove("drop-active");
        }
    }

    function handleDragStart(event, playerId) {
        draggedPlayerId = playerId;
        event.currentTarget.classList.add("is-dragging");

        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", playerId);
        }
    }

    function handleDragEnd(event) {
        draggedPlayerId = null;
        event.currentTarget.classList.remove("is-dragging");
        clearDropHighlights();
    }

    function resolveDraggedPlayerId(event) {
        if (event.dataTransfer) {
            var idFromDataTransfer = event.dataTransfer.getData("text/plain");

            if (idFromDataTransfer) {
                return idFromDataTransfer;
            }
        }

        return draggedPlayerId;
    }

    function movePlayerToKeeper(playerId) {
        var player = findPlayer(playerId);
        var currentKeeper = getKeeperPlayer();

        if (!player) {
            return;
        }

        if (currentKeeper && currentKeeper.id !== player.id) {
            return;
        }

        setPlayerLocation(player, "keeper");
        savePlayers(players);
        renderPlayers(players);
    }

    function movePlayerToOutfield(playerId) {
        var player = findPlayer(playerId);
        var outfieldPlayers = getOutfieldPlayers();

        if (!player) {
            return;
        }

        if (player.location !== "outfield" && outfieldPlayers.length >= outfieldSlotCount) {
            return;
        }

        setPlayerLocation(player, "outfield");
        savePlayers(players);
        renderPlayers(players);
    }

    function movePlayerToSubs(playerId) {
        var player = findPlayer(playerId);

        if (!player || player.location === "subs") {
            return;
        }

        setPlayerLocation(player, "subs");
        savePlayers(players);
        renderPlayers(players);
    }

    function installDropzoneHandlers() {
        function installDropTarget(element, onDrop) {
            element.addEventListener("dragover", function (event) {
                event.preventDefault();
                element.classList.add("drop-active");

                if (event.dataTransfer) {
                    event.dataTransfer.dropEffect = "move";
                }
            });

            element.addEventListener("dragleave", function (event) {
                if (event.relatedTarget && element.contains(event.relatedTarget)) {
                    return;
                }

                element.classList.remove("drop-active");
            });

            element.addEventListener("drop", function (event) {
                event.preventDefault();
                var playerId = resolveDraggedPlayerId(event);

                if (playerId) {
                    onDrop(playerId);
                }

                clearDropHighlights();
            });
        }

        installDropTarget(keeperDropzone, movePlayerToKeeper);
        installDropTarget(outfieldDropzone, movePlayerToOutfield);

        if (subsDropzone) {
            installDropTarget(subsDropzone, movePlayerToSubs);
        }
    }

    function renderMatchControls(currentMatchState) {
        if (!startResumeButton || !pauseButton || !matchStatus) {
            return;
        }

        document.body.classList.remove("match-running", "match-paused");
        startResumeButton.removeAttribute("data-state");

        if (currentMatchState === "running") {
            startResumeButton.disabled = true;
            startResumeButton.setAttribute("aria-label", "Match running");
            startResumeButton.setAttribute("title", "Match running");
            startResumeButton.setAttribute("data-state", "running");
            pauseButton.disabled = false;
            pauseButton.setAttribute("aria-label", "Pause match");
            pauseButton.setAttribute("title", "Pause match");
            matchStatus.textContent = "Match running";
            document.body.classList.add("match-running");
            return;
        }

        if (currentMatchState === "paused") {
            startResumeButton.disabled = false;
            startResumeButton.setAttribute("aria-label", "Resume match");
            startResumeButton.setAttribute("title", "Resume match");
            pauseButton.disabled = true;
            pauseButton.setAttribute("aria-label", "Pause match");
            pauseButton.setAttribute("title", "Pause match");
            matchStatus.textContent = "Match paused";
            document.body.classList.add("match-paused");
            return;
        }

        startResumeButton.disabled = false;
        startResumeButton.setAttribute("aria-label", "Start match");
        startResumeButton.setAttribute("title", "Start match");
        pauseButton.disabled = true;
        pauseButton.setAttribute("aria-label", "Pause match");
        pauseButton.setAttribute("title", "Pause match");
        matchStatus.textContent = "Match not started";
    }

    function createPlayerCard(player, onPitchCard) {
        var listItem = document.createElement("li");
        var playerDetails = document.createElement("div");
        var name = document.createElement("span");
        var status = document.createElement("span");

        listItem.className = onPitchCard ? "pitch-player-item" : "subs-list-item";
        listItem.draggable = true;
        playerDetails.className = onPitchCard ? "pitch-player-details" : "subs-list-player";
        name.className = onPitchCard ? "player-card-name" : "subs-list-name";
        status.className = onPitchCard ? "player-time" : "subs-list-status player-time";
        status.setAttribute("data-player-id", player.id);

        name.textContent = player.name;

        if (onPitchCard && player.location === "keeper") {
            status.textContent = "0.5x | " + formatSeconds(getDisplayedSeconds(player));
        } else if (onPitchCard) {
            status.textContent = formatSeconds(getDisplayedSeconds(player));
        } else {
            status.textContent = "Bench | " + formatSeconds(getDisplayedSeconds(player));
        }

        listItem.addEventListener("dragstart", function (event) {
            handleDragStart(event, player.id);
        });

        listItem.addEventListener("dragend", handleDragEnd);

        playerDetails.appendChild(name);
        playerDetails.appendChild(status);
        listItem.appendChild(playerDetails);

        return listItem;
    }

    function renderOutfieldGrid(outfieldPlayers) {
        var slotIndex = 0;

        outfieldGrid.innerHTML = "";

        for (slotIndex = 0; slotIndex < outfieldSlotCount; slotIndex += 1) {
            var slot = document.createElement("li");
            slot.className = "pitch-slot";

            if (outfieldPlayers[slotIndex]) {
                slot.appendChild(createPlayerCard(outfieldPlayers[slotIndex], true));
            } else {
                var hint = document.createElement("p");
                hint.className = "drop-hint drop-hint-center";
                hint.textContent = "Drop";
                slot.appendChild(hint);
            }

            outfieldGrid.appendChild(slot);
        }
    }

    function renderKeeperSlot(keeperPlayer) {
        keeperSlot.innerHTML = "";

        if (keeperPlayer) {
            keeperSlot.appendChild(createPlayerCard(keeperPlayer, true));
            return;
        }

        var hint = document.createElement("p");
        hint.className = "drop-hint";
        hint.textContent = "Drop keeper";
        keeperSlot.appendChild(hint);
    }

    function renderPlayers(currentPlayers) {
        var benchCount = 0;
        var keeperPlayer = getKeeperPlayer();
        var outfieldPlayers = getOutfieldPlayers();

        subsList.innerHTML = "";

        currentPlayers.forEach(function (player, index) {
            if (player.location !== "subs") {
                return;
            }

            benchCount += 1;

            var benchItem = createPlayerCard(player, false);
            var deleteButton = document.createElement("button");

            deleteButton.className = "subs-list-delete";
            deleteButton.type = "button";
            deleteButton.setAttribute("aria-label", "Delete " + player.name);
            deleteButton.setAttribute("title", "Delete " + player.name);
            deleteButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" class="subs-list-delete-icon"><path d="M9 3 H15 L16 5 H21 V7 H3 V5 H8 Z M6 9 H8 V19 H6 Z M11 9 H13 V19 H11 Z M16 9 H18 V19 H16 Z"></path></svg>';

            deleteButton.addEventListener("click", function () {
                var confirmed = window.confirm('Delete player "' + player.name + '"?');

                if (!confirmed) {
                    return;
                }

                stopPlayerClock(player);
                currentPlayers.splice(index, 1);
                savePlayers(currentPlayers);
                renderPlayers(currentPlayers);
            });

            benchItem.appendChild(deleteButton);
            subsList.appendChild(benchItem);
        });

        renderKeeperSlot(keeperPlayer);
        renderOutfieldGrid(outfieldPlayers);
        emptyState.hidden = benchCount > 0;
        updateTimerLabels();
    }

    var players = loadPlayers();
    var matchState = loadMatchState();

    syncClocksForMatchState();
    savePlayers(players);

    renderPlayers(players);
    renderMatchControls(matchState);
    installDropzoneHandlers();

    window.setInterval(function () {
        if (matchState !== "running") {
            return;
        }

        updateTimerLabels();
    }, 1000);

    playerForm.addEventListener("submit", function (event) {
        event.preventDefault();

        var playerName = playerNameInput.value.trim();

        if (!playerName) {
            playerNameInput.focus();
            return;
        }

        players.push({
            id: createPlayerId(),
            name: playerName,
            location: "subs",
            playingSeconds: 0,
            lastStartedAt: null
        });

        savePlayers(players);
        renderPlayers(players);
        playerForm.reset();
        playerNameInput.focus();
    });

    if (startResumeButton) {
        startResumeButton.addEventListener("click", function () {
            matchState = "running";
            syncClocksForMatchState();
            savePlayers(players);
            saveMatchState(matchState);
            renderMatchControls(matchState);
            renderPlayers(players);
        });
    }

    if (pauseButton) {
        pauseButton.addEventListener("click", function () {
            matchState = "paused";
            syncClocksForMatchState();
            savePlayers(players);
            saveMatchState(matchState);
            renderMatchControls(matchState);
            renderPlayers(players);
        });
    }

    if (resetButton) {
        resetButton.addEventListener("click", function () {
            players = [];
            matchState = "idle";
            clearStoredState();
            renderPlayers(players);
            renderMatchControls(matchState);
            playerForm.reset();
            playerNameInput.focus();
        });
    }
});