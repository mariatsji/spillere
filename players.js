document.addEventListener("DOMContentLoaded", function () {
    var storageKey = "spillere.subs";
    var playerForm = document.getElementById("player-form");
    var playerNameInput = document.getElementById("player-name");
    var subsList = document.getElementById("subs-list");
    var emptyState = document.getElementById("subs-empty-state");

    if (!playerForm || !playerNameInput || !subsList || !emptyState) {
        return;
    }

    function loadPlayers() {
        var savedPlayers = window.localStorage.getItem(storageKey);

        if (!savedPlayers) {
            return [];
        }

        try {
            var parsedPlayers = JSON.parse(savedPlayers);

            if (Array.isArray(parsedPlayers)) {
                return parsedPlayers;
            }
        } catch (error) {
            console.error("Unable to parse saved players", error);
        }

        return [];
    }

    function savePlayers(players) {
        window.localStorage.setItem(storageKey, JSON.stringify(players));
    }

    function renderPlayers(players) {
        subsList.innerHTML = "";

        players.forEach(function (player) {
            var listItem = document.createElement("li");
            var name = document.createElement("span");
            var status = document.createElement("span");

            listItem.className = "subs-list-item";
            name.className = "subs-list-name";
            status.className = "subs-list-status";

            name.textContent = player.name;
            status.textContent = "Available on bench";

            listItem.appendChild(name);
            listItem.appendChild(status);
            subsList.appendChild(listItem);
        });

        emptyState.hidden = players.length > 0;
    }

    var players = loadPlayers();
    renderPlayers(players);

    playerForm.addEventListener("submit", function (event) {
        event.preventDefault();

        var playerName = playerNameInput.value.trim();

        if (!playerName) {
            playerNameInput.focus();
            return;
        }

        players.push({ name: playerName });
        savePlayers(players);
        renderPlayers(players);
        playerForm.reset();
        playerNameInput.focus();
    });
});