// Variabel Global
var SUPABASE_URL = "https://dcfgjrfxnoeumusesbeo.supabase.co";
var SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRjZmdqcmZ4bm9ldW11c2VzYmVvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODk2MzU4OSwiZXhwIjoyMDk0NTM5NTg5fQ.vt7Cbda1MnRRIzcSWia79HewVLnYTkIqM_dALx0euSY";
var db = null;
try { db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY); } catch (e) { console.error("Database gagal dimuat", e); }

var myRoom = "", myName = "", myRole = null, myChannel = null;
var isAnimating = false, pregameCountdownInterval = null;
var gameStarted = false, suitResultTimer = null, activeHole = null; 
var confettiFired = false, isTutorialMode = false;
var matchTimer = null, matchSeconds = 0;

var myClientId = "player_" + Math.random().toString(36).substr(2, 9);
try {
    myClientId = sessionStorage.getItem('congklak_client_id') || myClientId;
    sessionStorage.setItem('congklak_client_id', myClientId);
} catch(e) {}

var gameState = { board: new Array(16).fill(0), current_player: 1, game_over: false, winner: null, p1_ready: false, p2_ready: false, p1_suit: null, p2_suit: null, suit_winner: null, p1_name: "", p2_name: "" };
var audioCtx = null;
