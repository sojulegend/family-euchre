import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { createClient } from '@supabase/supabase-js';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Crown, MessageCircle, RefreshCcw, Users, Copy, PlayCircle, Trophy, Link as LinkIcon, Settings2 } from 'lucide-react';

/**
 * ONLINE MULTIPLAYER EUCHRE — SINGLE FILE REACT APP
 *
 * This version is built for 4 human players only.
 * It uses Supabase for realtime sync.
 *
 * SETUP YOU NEED TO DO:
 * 1) Create a Supabase project
 * 2) Add your URL + anon key below
 * 3) Create the three tables shown in the SQL block at the bottom of this file
 *
 * This is intentionally a practical MVP, not a full tournament-grade rules engine.
 */

const SUPABASE_URL = 'https://treoyzpkzeevobukrrtr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRyZW95enBremVldm9idWtycnRyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwMzE4NjUsImV4cCI6MjA4ODYwNzg2NX0.cLu614hFO3UaP2TsEJhYpagmaxjwUjKEIrUIYsLxUVM';
const supabaseReady =
  SUPABASE_URL.startsWith('http') &&
  SUPABASE_ANON_KEY &&
  !SUPABASE_ANON_KEY.includes('YOUR_');
const supabase = supabaseReady ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const SUITS = ['♠', '♥', '♦', '♣'];
const SUIT_NAMES = { '♠': 'Spades', '♥': 'Hearts', '♦': 'Diamonds', '♣': 'Clubs' };
const SUIT_COLORS = { '♠': 'text-slate-900', '♣': 'text-slate-900', '♥': 'text-red-600', '♦': 'text-red-600' };
const RANKS = ['9', '10', 'J', 'Q', 'K', 'A'];
const LEFT_BOWER = { '♥': '♦', '♦': '♥', '♠': '♣', '♣': '♠' };
const POSITIONS = ['South', 'West', 'North', 'East'];

function makeDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank, id: `${rank}${suit}` });
    }
  }
  return deck;
}

function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function randomCode(length = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < length; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function isRightBower(card, trump) {
  return card.rank === 'J' && card.suit === trump;
}

function isLeftBower(card, trump) {
  return card.rank === 'J' && card.suit === LEFT_BOWER[trump];
}

function effectiveSuit(card, trump) {
  if (!card) return null;
  if (isLeftBower(card, trump)) return trump;
  return card.suit;
}

function cardPower(card, leadSuit, trump) {
  if (isRightBower(card, trump)) return 200;
  if (isLeftBower(card, trump)) return 199;

  const effSuit = effectiveSuit(card, trump);
  const trumpOrder = { A: 198, K: 197, Q: 196, '10': 195, '9': 194 };
  const leadOrder = { A: 120, K: 119, Q: 118, J: 117, '10': 116, '9': 115 };
  const offOrder = { A: 20, K: 19, Q: 18, J: 17, '10': 16, '9': 15 };

  if (effSuit === trump) return trumpOrder[card.rank] ?? 190;
  if (effSuit === leadSuit) return leadOrder[card.rank] ?? 0;
  return offOrder[card.rank] ?? 0;
}

function determineTrickWinner(trick, leader, trump) {
  const leadSuit = effectiveSuit(trick[0]?.card, trump);
  let bestIndex = 0;
  let bestPower = cardPower(trick[0].card, leadSuit, trump);
  for (let i = 1; i < trick.length; i++) {
    const power = cardPower(trick[i].card, leadSuit, trump);
    if (power > bestPower) {
      bestPower = power;
      bestIndex = i;
    }
  }
  return (leader + bestIndex) % 4;
}

function getValidCards(hand, leadSuit, trump) {
  if (!leadSuit) return hand;
  const matching = hand.filter((card) => effectiveSuit(card, trump) === leadSuit);
  return matching.length ? matching : hand;
}

function sortHand(hand, trump) {
  const suitOrder = { '♠': 0, '♥': 1, '♦': 2, '♣': 3 };
  return [...hand].sort((a, b) => {
    const aSuit = effectiveSuit(a, trump) || a.suit;
    const bSuit = effectiveSuit(b, trump) || b.suit;
    const aTrump = aSuit === trump;
    const bTrump = bSuit === trump;
    if (aTrump !== bTrump) return aTrump ? -1 : 1;
    if (aSuit !== bSuit) return suitOrder[aSuit] - suitOrder[bSuit];
    return cardPower(b, aSuit, trump) - cardPower(a, aSuit, trump);
  });
}

function teamOfSeat(seat) {
  return seat % 2;
}

function scoreRound(makerTeam, tricksWon) {
  const makerTricks = tricksWon[makerTeam];
  const defenders = makerTeam === 0 ? 1 : 0;
  if (makerTricks === 5) return { scores: { 0: 0, 1: 0, [makerTeam]: 2 }, summary: 'March. Making team took all 5 tricks for 2 points.' };
  if (makerTricks >= 3) return { scores: { 0: 0, 1: 0, [makerTeam]: 1 }, summary: 'Making team made trump and scored 1 point.' };
  return { scores: { 0: 0, 1: 0, [defenders]: 2 }, summary: 'Euchred. Defenders scored 2 points.' };
}

function initialState() {
  return {
    status: 'lobby',
    dealer: 0,
    hostSeat: 0,
    trump: null,
    makerTeam: null,
    orderingSeat: null,
    currentTurn: 0,
    trickLeader: 0,
    currentTrick: [],
    turnedUp: null,
    hands: [[], [], [], []],
    scores: { 0: 0, 1: 0 },
    tricksWon: { 0: 0, 1: 0 },
    orderingStage: 'round1',
    message: 'Waiting in lobby.',
    handNumber: 0,
    roundSummary: '',
    winnerTeam: null,
    aloneSeat: null,
    alonePartnerSeat: null,
    passedRound2: [],
    settings: {
      stickDealer: false,
      allowGoAlone: true,
    },
  };
}

function dealNewHand(state) {
  const deck = shuffle(makeDeck());
  const hands = [[], [], [], []];
  let idx = 0;
  for (let r = 0; r < 5; r++) {
    for (let p = 1; p <= 4; p++) {
      hands[(state.dealer + p) % 4].push(deck[idx++]);
    }
  }
  const kitty = deck.slice(idx);
  const turnedUp = kitty[0];
  return {
    ...state,
    status: 'ordering',
    trump: null,
    makerTeam: null,
    orderingSeat: null,
    currentTurn: (state.dealer + 1) % 4,
    trickLeader: (state.dealer + 1) % 4,
    currentTrick: [],
    turnedUp,
    hands: hands.map((h) => sortHand(h, null)),
    tricksWon: { 0: 0, 1: 0 },
    orderingStage: 'round1',
    message: `Turn-up card is ${turnedUp.rank}${turnedUp.suit}. Order it up or pass.`,
    handNumber: state.handNumber + 1,
    roundSummary: '',
    aloneSeat: null,
    alonePartnerSeat: null,
    passedRound2: [],
  };
}

function applyOrderUp(state, seat, goAlone = false) {
  const trump = state.turnedUp.suit;
  const dealerHand = [...state.hands[state.dealer], state.turnedUp];
  dealerHand.sort((a, b) => cardPower(a, trump, trump) - cardPower(b, trump, trump));
  dealerHand.shift();
  const hands = state.hands.map((h, i) => (i === state.dealer ? sortHand(dealerHand, trump) : sortHand(h, trump)));
  const alonePartnerSeat = goAlone ? (seat + 2) % 4 : null;
  return {
    ...state,
    status: 'playing',
    trump,
    makerTeam: teamOfSeat(seat),
    orderingSeat: seat,
    hands,
    currentTurn: (state.dealer + 1) % 4,
    trickLeader: (state.dealer + 1) % 4,
    message: `${seatLabel(seat)} ordered up ${SUIT_NAMES[trump]}${goAlone ? ' and is going alone' : ''}.`,
    aloneSeat: goAlone ? seat : null,
    alonePartnerSeat,
  };
}

function applyChooseTrump(state, seat, suit, goAlone = false) {
  const alonePartnerSeat = goAlone ? (seat + 2) % 4 : null;
  return {
    ...state,
    status: 'playing',
    trump: suit,
    makerTeam: teamOfSeat(seat),
    orderingSeat: seat,
    hands: state.hands.map((h) => sortHand(h, suit)),
    currentTurn: (state.dealer + 1) % 4,
    trickLeader: (state.dealer + 1) % 4,
    message: `${seatLabel(seat)} called ${SUIT_NAMES[suit]} trump${goAlone ? ' and is going alone' : ''}.`,
    aloneSeat: goAlone ? seat : null,
    alonePartnerSeat,
  };
}

function seatLabel(seat) {
  return POSITIONS[seat] || `Seat ${seat + 1}`;
}

function advancePass(state) {
  const next = (state.currentTurn + 1) % 4;
  if (state.orderingStage === 'round1') {
    if (next === (state.dealer + 1) % 4) {
      return {
        ...state,
        orderingStage: 'round2',
        currentTurn: (state.dealer + 1) % 4,
        message: `Everybody passed round 1. Pick trump other than ${SUIT_NAMES[state.turnedUp.suit]}.`,
      };
    }
    return {
      ...state,
      currentTurn: next,
      message: `${seatLabel(state.currentTurn)} passed.`,
    };
  }

  const passedRound2 = [...new Set([...(state.passedRound2 || []), state.currentTurn])];
  const dealerMustChoose = state.settings?.stickDealer && passedRound2.includes((state.dealer + 3) % 4) && next === state.dealer;

  if (dealerMustChoose) {
    return {
      ...state,
      orderingStage: 'round2',
      currentTurn: state.dealer,
      passedRound2,
      message: 'Stick the dealer is on. Dealer must choose trump.',
    };
  }

  if (!state.settings?.stickDealer && next === (state.dealer + 1) % 4) {
    return {
      ...dealNewHand({ ...state, dealer: (state.dealer + 1) % 4, status: 'lobby' }),
      message: 'Everyone passed both rounds. Hand redealt.',
    };
  }

  return {
    ...state,
    currentTurn: next,
    passedRound2,
    message: `${seatLabel(state.currentTurn)} passed again.`,
  };
}

function activeSeatsForTrick(state) {
  return [0, 1, 2, 3].filter((seat) => seat !== state.alonePartnerSeat);
}

function nextActiveSeat(fromSeat, state) {
  let s = fromSeat;
  do {
    s = (s + 1) % 4;
  } while (s === state.alonePartnerSeat);
  return s;
}

function trickLeadSeat(state, trick) {
  return state.trickLeader;
}

function scoreRoundExtended(makerTeam, tricksWon, aloneSeat) {
  const base = scoreRound(makerTeam, tricksWon);
  if (aloneSeat !== null && tricksWon[makerTeam] === 5) {
    return { scores: { 0: 0, 1: 0, [makerTeam]: 4 }, summary: 'Loner march. Making team took all 5 tricks alone for 4 points.' };
  }
  return base;
}

function applyPlayCard(state, seat, cardId) {
  if (state.status !== 'playing') return state;
  if (seat !== state.currentTurn) return state;
  if (seat === state.alonePartnerSeat) return state;
  const hand = state.hands[seat];
  const card = hand.find((c) => c.id === cardId);
  if (!card) return state;

  const leadSuit = state.currentTrick.length ? effectiveSuit(state.currentTrick[0].card, state.trump) : null;
  const valid = getValidCards(hand, leadSuit, state.trump);
  if (!valid.some((c) => c.id === cardId)) return state;

  const nextHands = state.hands.map((h, i) => (i === seat ? h.filter((c) => c.id !== cardId) : h));
  const nextTrick = [...state.currentTrick, { seat, card }];
  const neededCards = activeSeatsForTrick(state).length;

  if (nextTrick.length < neededCards) {
    return {
      ...state,
      hands: nextHands,
      currentTrick: nextTrick,
      currentTurn: nextActiveSeat(seat, state),
      message: `${seatLabel(seat)} played ${card.rank}${card.suit}.`,
    };
  }

  const winner = determineTrickWinner(nextTrick, trickLeadSeat(state, nextTrick), state.trump);
  const nextTricksWon = { ...state.tricksWon, [teamOfSeat(winner)]: state.tricksWon[teamOfSeat(winner)] + 1 };
  const handEnded = activeSeatsForTrick(state).every((activeSeat) => nextHands[activeSeat].length === 0);

  if (!handEnded) {
    return {
      ...state,
      hands: nextHands,
      currentTrick: [],
      currentTurn: winner,
      trickLeader: winner,
      tricksWon: nextTricksWon,
      message: `${seatLabel(winner)} won the trick.`,
    };
  }

  const scoring = scoreRoundExtended(state.makerTeam, nextTricksWon, state.aloneSeat);
  const newScores = {
    0: state.scores[0] + scoring.scores[0],
    1: state.scores[1] + scoring.scores[1],
  };
  const winnerTeam = newScores[0] >= 10 ? 0 : newScores[1] >= 10 ? 1 : null;

  return {
    ...state,
    hands: nextHands,
    currentTrick: [],
    currentTurn: winner,
    trickLeader: winner,
    tricksWon: nextTricksWon,
    scores: newScores,
    roundSummary: scoring.summary,
    status: winnerTeam !== null ? 'gameover' : 'roundEnd',
    winnerTeam,
    message: winnerTeam !== null ? `Team ${winnerTeam === 0 ? 'South/North' : 'West/East'} wins the game.` : `${scoring.summary} Start next hand.`,
  };
}

function CardFace({ card, faceDown = false, small = false, disabled = false, onClick }) {
  if (!card && !faceDown) return null;
  const size = small ? 'w-12 h-16' : 'w-16 h-24';
  return (
    <button
      onClick={onClick}
      disabled={disabled || !onClick}
      className={`${size} rounded-2xl border shadow-sm flex flex-col items-center justify-between p-2 transition-all ${faceDown ? 'bg-slate-800 border-slate-700' : 'bg-white'} ${disabled ? 'opacity-50 cursor-not-allowed' : onClick ? 'hover:-translate-y-1 hover:shadow-md' : ''}`}
    >
      {faceDown ? (
        <div className="w-full h-full rounded-xl border border-slate-600 bg-slate-700/70" />
      ) : (
        <>
          <div className={`text-sm font-bold ${SUIT_COLORS[card.suit]}`}>{card.rank}</div>
          <div className={`text-2xl ${SUIT_COLORS[card.suit]}`}>{card.suit}</div>
          <div className={`text-sm font-bold ${SUIT_COLORS[card.suit]}`}>{card.rank}</div>
        </>
      )}
    </button>
  );
}

function PlayerSpot({ label, name, isTurn, isDealer, isSelf, handCount, team }) {
  return (
    <div className={`rounded-2xl px-3 py-2 border shadow-sm ${isTurn ? 'bg-slate-900 text-white' : 'bg-white'}`}>
      <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
        <span>{label}</span>
        {name ? <span className="text-xs opacity-80">· {name}</span> : <span className="text-xs opacity-50">· empty</span>}
        {isSelf && <Badge variant="secondary">You</Badge>}
        {isDealer && <Badge variant="outline">Dealer</Badge>}
        <Badge variant="outline">Team {team + 1}</Badge>
      </div>
      <div className="text-xs mt-1 opacity-80">Cards: {handCount}</div>
    </div>
  );
}

export default function OnlineEuchreTable() {
  const [playerName, setPlayerName] = useState(localStorage.getItem('euchre_name') || '');
  const [preferredSeat, setPreferredSeat] = useState(localStorage.getItem('euchre_preferred_seat') || '');
  const [goAloneChoice, setGoAloneChoice] = useState(false);
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [room, setRoom] = useState(null);
  const [players, setPlayers] = useState([]);
  const [game, setGame] = useState(initialState());
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef(null);

  const me = useMemo(() => players.find((p) => p.client_id === getClientId()), [players]);
  const mySeat = me?.seat ?? null;
  const myHand = mySeat !== null ? game.hands[mySeat] || [] : [];
  const leadSuit = game.currentTrick.length ? effectiveSuit(game.currentTrick[0].card, game.trump) : null;
  const validCards = useMemo(() => getValidCards(myHand, leadSuit, game.trump), [myHand, leadSuit, game.trump]);
  const isMyTurn = mySeat !== null && game.currentTurn === mySeat;
  const allSeatsFilled = players.length === 4;
  const iAmHost = room && me && room.host_seat === me.seat;
  const inviteLink = room?.code ? `${window.location.origin}${window.location.pathname}?room=${room.code}` : '';

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomFromUrl = params.get('room');
    if (roomFromUrl && !roomCodeInput && !room?.code) setRoomCodeInput(roomFromUrl.toUpperCase());
  }, []);

  useEffect(() => {
    if (!supabaseReady || !room?.code) return;

    fetchRoomData(room.code);

    const roomChannel = supabase
      .channel(`room-${room.code}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'euchre_rooms', filter: `code=eq.${room.code}` }, (payload) => {
        if (payload.new) {
          setRoom(payload.new);
          setGame(payload.new.game_state);
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'euchre_players', filter: `room_code=eq.${room.code}` }, () => {
        fetchPlayers(room.code);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'euchre_messages', filter: `room_code=eq.${room.code}` }, () => {
        fetchMessages(room.code);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(roomChannel);
    };
  }, [room?.code]);

  async function fetchRoomData(code) {
    await Promise.all([fetchRoom(code), fetchPlayers(code), fetchMessages(code)]);
  }

  async function fetchRoom(code) {
    if (!supabase) return;
    const { data, error } = await supabase.from('euchre_rooms').select('*').eq('code', code).single();
    if (error) {
      setError(error.message);
      return;
    }
    setRoom(data);
    setGame(data.game_state || initialState());
  }

  async function fetchPlayers(code) {
    if (!supabase) return;
    const { data, error } = await supabase.from('euchre_players').select('*').eq('room_code', code).order('seat', { ascending: true });
    if (!error) setPlayers(data || []);
  }

  async function fetchMessages(code) {
    if (!supabase) return;
    const { data, error } = await supabase.from('euchre_messages').select('*').eq('room_code', code).order('created_at', { ascending: true }).limit(200);
    if (!error) setMessages(data || []);
  }

  async function createRoom() {
    if (!supabaseReady) {
      setError('Add your Supabase URL and anon key first. The app is cute, but telepathy is not a backend.');
      return;
    }
    if (!playerName.trim()) {
      setError('Enter your name first. Mystery diva energy is not helping the seating chart.');
      return;
    }

    setLoading(true);
    setError('');
    localStorage.setItem('euchre_name', playerName.trim());
    if (preferredSeat !== '') localStorage.setItem('euchre_preferred_seat', preferredSeat);

    const code = randomCode();
    const hostClientId = getClientId();
    const freshState = initialState();
    const hostSeat = preferredSeat === '' ? 0 : Number(preferredSeat);

    const { error: roomError } = await supabase.from('euchre_rooms').insert({
      code,
      host_seat: hostSeat,
      game_state: { ...freshState, hostSeat },
      created_by: hostClientId,
    });

    if (roomError) {
      setLoading(false);
      setError(roomError.message);
      return;
    }

    const { error: playerError } = await supabase.from('euchre_players').insert({
      room_code: code,
      client_id: hostClientId,
      seat: hostSeat,
      name: playerName.trim(),
    });

    if (playerError) {
      setLoading(false);
      setError(playerError.message);
      return;
    }

    window.history.replaceState({}, '', `${window.location.pathname}?room=${code}`);
    await fetchRoomData(code);
    setLoading(false);
  }

  async function joinRoom() {
    if (!supabaseReady) {
      setError('Supabase config is missing. She cannot join the function without the venue.');
      return;
    }
    if (!playerName.trim()) {
      setError('Enter your name first.');
      return;
    }
    const code = roomCodeInput.trim().toUpperCase();
    if (!code) {
      setError('Enter a room code.');
      return;
    }

    setLoading(true);
    setError('');
    localStorage.setItem('euchre_name', playerName.trim());
    if (preferredSeat !== '') localStorage.setItem('euchre_preferred_seat', preferredSeat);

    const { data: roomData, error: roomError } = await supabase.from('euchre_rooms').select('*').eq('code', code).single();
    if (roomError || !roomData) {
      setLoading(false);
      setError('Room not found.');
      return;
    }

    const { data: existingPlayers } = await supabase.from('euchre_players').select('*').eq('room_code', code).order('seat', { ascending: true });
    const current = existingPlayers || [];
    const existingMe = current.find((p) => p.client_id === getClientId());

    if (existingMe) {
      if (existingMe.name !== playerName.trim()) {
        await supabase.from('euchre_players').update({ name: playerName.trim() }).eq('room_code', code).eq('client_id', getClientId());
      }
    } else {
      let desiredSeat = preferredSeat === '' ? null : Number(preferredSeat);
      if (desiredSeat !== null && current.some((p) => p.seat === desiredSeat)) desiredSeat = null;
      const openSeat = desiredSeat !== null ? desiredSeat : [0, 1, 2, 3].find((seat) => !current.some((p) => p.seat === seat));
      if (openSeat === undefined) {
        setLoading(false);
        setError('Room is full. Euchre, not clown car.');
        return;
      }
      const { error: joinError } = await supabase.from('euchre_players').insert({
        room_code: code,
        client_id: getClientId(),
        seat: openSeat,
        name: playerName.trim(),
      });
      if (joinError) {
        setLoading(false);
        setError(joinError.message);
        return;
      }
    }

    window.history.replaceState({}, '', `${window.location.pathname}?room=${code}`);
    await fetchRoomData(code);
    setLoading(false);
  }

  async function updateGame(nextGame) {
    if (!supabase || !room?.code) return;
    const { error } = await supabase.from('euchre_rooms').update({ game_state: nextGame }).eq('code', room.code);
    if (error) setError(error.message);
  }

  async function sendMessage() {
    if (!supabase || !room?.code || !me || !chatInput.trim()) return;
    const text = chatInput.trim().slice(0, 280);
    setChatInput('');
    const { error } = await supabase.from('euchre_messages').insert({
      room_code: room.code,
      seat: me.seat,
      name: me.name,
      body: text,
    });
    if (error) setError(error.message);
  }

  async function startGame() {
    if (!iAmHost || !allSeatsFilled) return;
    await updateGame(dealNewHand({ ...initialState(), dealer: game.dealer, scores: game.scores }));
  }

  async function nextHand() {
    if (!iAmHost) return;
    const nextDealer = (game.dealer + 1) % 4;
    await updateGame(dealNewHand({ ...game, dealer: nextDealer, status: 'lobby' }));
  }

  async function resetGame() {
    if (!iAmHost) return;
    await updateGame({ ...initialState(), settings: game.settings || initialState().settings, hostSeat: game.hostSeat ?? 0 });
  }

  async function setSeat(seat) {
    if (!supabase || !room?.code) return;
    const taken = players.some((p) => p.seat === seat && p.client_id !== getClientId());
    if (taken) {
      setError('That seat is already taken. Dad cannot just annex East.');
      return;
    }
    localStorage.setItem('euchre_preferred_seat', String(seat));
    setPreferredSeat(String(seat));
    const existing = players.find((p) => p.client_id === getClientId());
    if (existing) {
      const { error } = await supabase.from('euchre_players').update({ seat, name: playerName.trim() || existing.name }).eq('room_code', room.code).eq('client_id', getClientId());
      if (error) setError(error.message);
    }
  }

  async function updateSettings(patch) {
    if (!iAmHost) return;
    await updateGame({ ...game, settings: { ...(game.settings || initialState().settings), ...patch } });
  }

  async function pass() {
    if (!isMyTurn) return;
    await updateGame(advancePass(game));
  }

  async function orderUp() {
    if (!isMyTurn || game.status !== 'ordering' || game.orderingStage !== 'round1') return;
    await updateGame(applyOrderUp(game, mySeat, !!goAloneChoice && !!game.settings?.allowGoAlone));
    setGoAloneChoice(false);
  }

  async function chooseTrump(suit) {
    if (!isMyTurn || game.status !== 'ordering' || game.orderingStage !== 'round2') return;
    if (suit === game.turnedUp?.suit) return;
    await updateGame(applyChooseTrump(game, mySeat, suit, !!goAloneChoice && !!game.settings?.allowGoAlone));
    setGoAloneChoice(false);
  }

  async function playCard(cardId) {
    if (!isMyTurn || game.status !== 'playing') return;
    await updateGame(applyPlayCard(game, mySeat, cardId));
  }

  async function copyCode() {
    if (!room?.code) return;
    await navigator.clipboard.writeText(room.code);
  }

  async function copyInviteLink() {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
  }

  const seatToPlayer = useMemo(() => {
    const map = {};
    players.forEach((p) => { map[p.seat] = p; });
    return map;
  }, [players]);

  const seatHandsCount = [0, 1, 2, 3].map((seat) => game.hands?.[seat]?.length ?? 0);
  const team0Name = `${seatToPlayer[0]?.name || 'South'} + ${seatToPlayer[2]?.name || 'North'}`;
  const team1Name = `${seatToPlayer[1]?.name || 'West'} + ${seatToPlayer[3]?.name || 'East'}`;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#1f6f4a,_#0f172a_60%)] p-4 md:p-8 text-slate-900">
      <div className="max-w-7xl mx-auto space-y-6">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="grid xl:grid-cols-[1.3fr_0.7fr] gap-6">
          <div className="space-y-6">
            <Card className="rounded-3xl border-0 shadow-xl bg-white/95 backdrop-blur">
              <CardHeader>
                <CardTitle className="flex items-center gap-3 text-2xl">
                  <Users className="w-6 h-6" />
                  Online Euchre Table
                </CardTitle>
                <div className="text-sm text-slate-600">4 human players only. South + North vs West + East. Browser link multiplayer, no computer fillers, no weird robot uncle.</div>
              </CardHeader>
              <CardContent className="grid md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Input value={playerName} onChange={(e) => setPlayerName(e.target.value)} placeholder="Your name" />
                    <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={preferredSeat} onChange={(e) => setPreferredSeat(e.target.value)}>
                      <option value="">Preferred seat (any open)</option>
                      <option value="0">South</option>
                      <option value="1">West</option>
                      <option value="2">North</option>
                      <option value="3">East</option>
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={createRoom} disabled={loading}>Create Room</Button>
                    <Input value={roomCodeInput} onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())} placeholder="Room code" />
                    <Button variant="outline" onClick={joinRoom} disabled={loading}>Join</Button>
                  </div>
                  {!supabaseReady && (
                    <div className="text-xs rounded-2xl bg-amber-50 text-amber-900 p-3">
                      Add Supabase credentials in the file first or online multiplayer will just stand there looking pretty and doing nothing.
                    </div>
                  )}
                  {error && <div className="text-sm rounded-2xl bg-rose-50 text-rose-900 p-3">{error}</div>}
                </div>

                <div className="rounded-2xl bg-slate-100 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">Room</div>
                    {room?.code && (
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={copyCode}><Copy className="w-4 h-4 mr-1" /> Code</Button>
                        <Button variant="ghost" size="sm" onClick={copyInviteLink}><LinkIcon className="w-4 h-4 mr-1" /> Invite link</Button>
                      </div>
                    )}
                  </div>
                  <div className="text-2xl font-bold tracking-widest">{room?.code || '—'}</div>
                  <div className="text-sm text-slate-600">Share the code or the invite link with Dad, Mom, and boyfriend so they can join from their own computers.</div>
                  <div className="text-sm text-slate-600">Host controls starting the game and moving to the next hand.</div>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-3xl border-0 shadow-xl bg-white/95 backdrop-blur overflow-hidden">
              <CardHeader className="border-b bg-emerald-950 text-white">
                <CardTitle className="flex items-center gap-2"><PlayCircle className="w-5 h-5" /> Table</CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="grid md:grid-cols-2 gap-4 mb-4">
                  {[0, 1, 2, 3].map((seat) => {
                    const taken = players.some((p) => p.seat === seat);
                    return (
                      <Button key={`seatbtn-${seat}`} variant={mySeat === seat ? 'default' : 'outline'} className="justify-start" onClick={() => setSeat(seat)} disabled={taken && mySeat !== seat || game.status !== 'lobby'}>
                        {seatLabel(seat)} {taken && mySeat !== seat ? '· taken' : mySeat === seat ? '· you' : '· open'}
                      </Button>
                    );
                  })}
                </div>

                <div className="grid md:grid-cols-2 gap-4 mb-4">
                  {[0, 1, 2, 3].map((seat) => (
                    <PlayerSpot
                      key={seat}
                      label={seatLabel(seat)}
                      name={seatToPlayer[seat]?.name}
                      isTurn={game.currentTurn === seat && ['ordering', 'playing'].includes(game.status)}
                      isDealer={game.dealer === seat}
                      isSelf={mySeat === seat}
                      handCount={seatHandsCount[seat]}
                      team={teamOfSeat(seat)}
                    />
                  ))}
                </div>

                <div className="rounded-[2rem] bg-[radial-gradient(circle_at_center,_#1d7a52,_#14532d)] min-h-[520px] border-[10px] border-amber-950/80 shadow-inner relative p-6">
                  <div className="absolute top-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
                    <div className="text-white text-sm font-medium">North</div>
                    <div className="flex gap-2">{Array.from({ length: Math.max(seatHandsCount[2], 0) }).map((_, i) => <CardFace key={i} faceDown small />)}</div>
                  </div>

                  <div className="absolute left-6 top-1/2 -translate-y-1/2 flex flex-col items-center gap-2">
                    <div className="text-white text-sm font-medium">West</div>
                    <div className="flex flex-col gap-1">{Array.from({ length: Math.max(seatHandsCount[1], 0) }).map((_, i) => <CardFace key={i} faceDown small />)}</div>
                  </div>

                  <div className="absolute right-6 top-1/2 -translate-y-1/2 flex flex-col items-center gap-2">
                    <div className="text-white text-sm font-medium">East</div>
                    <div className="flex flex-col gap-1">{Array.from({ length: Math.max(seatHandsCount[3], 0) }).map((_, i) => <CardFace key={i} faceDown small />)}</div>
                  </div>

                  <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
                    <div className="text-white text-sm font-medium">South</div>
                    <div className="flex gap-2">{Array.from({ length: Math.max(seatHandsCount[0], 0) }).map((_, i) => <CardFace key={i} faceDown small />)}</div>
                  </div>

                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="grid grid-cols-2 gap-4">
                      {[0, 1, 2, 3].map((seat) => {
                        const entry = game.currentTrick.find((x) => x.seat === seat);
                        return (
                          <div key={seat} className="flex flex-col items-center gap-1 min-w-[90px]">
                            {entry ? <CardFace card={entry.card} /> : <div className="w-16 h-24 rounded-2xl border border-dashed border-white/40" />}
                            <div className="text-xs text-white/90">{seatLabel(seat)}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-3xl border-0 shadow-xl bg-white/95 backdrop-blur">
              <CardHeader>
                <CardTitle>Your Hand</CardTitle>
              </CardHeader>
              <CardContent>
                {mySeat === null ? (
                  <div className="text-sm text-slate-500">Join a room first.</div>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-3">
                      {myHand.map((card) => {
                        const allowed = isMyTurn && game.status === 'playing' && validCards.some((c) => c.id === card.id);
                        return (
                          <CardFace key={card.id} card={card} onClick={allowed ? () => playCard(card.id) : undefined} disabled={!allowed} />
                        );
                      })}
                    </div>
                    {leadSuit && game.status === 'playing' && (
                      <div className="mt-4 text-sm text-slate-600">Lead suit: {SUIT_NAMES[leadSuit]}. Follow suit if you can. Euchre remains committed to being dramatic but structured.</div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="rounded-3xl border-0 shadow-xl bg-white/95 backdrop-blur">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Crown className="w-5 h-5" /> Match Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-2xl bg-slate-100 p-4 text-sm text-slate-700">{game.message}</div>
                {game.roundSummary && <div className="rounded-2xl bg-amber-50 text-amber-900 p-4 text-sm">{game.roundSummary}</div>}

                <div className="grid gap-3">
                  <div className="rounded-2xl bg-slate-100 p-4">
                    <div className="text-sm text-slate-500 mb-2">Score</div>
                    <div className="flex items-center justify-between font-semibold"><span>{team0Name}</span><span>{game.scores[0]}</span></div>
                    <div className="flex items-center justify-between font-semibold mt-2"><span>{team1Name}</span><span>{game.scores[1]}</span></div>
                    <div className="text-sm text-slate-600 mt-3">Tricks this hand: Team 1 {game.tricksWon[0]} · Team 2 {game.tricksWon[1]}</div>
                  </div>

                  <div className="rounded-2xl bg-slate-100 p-4">
                    <div className="text-sm text-slate-500">Trump</div>
                    <div className="text-lg font-semibold">{game.trump ? `${SUIT_NAMES[game.trump]} ${game.trump}` : 'Not selected yet'}</div>
                    <div className="text-sm text-slate-600 mt-2">Turn-up: {game.turnedUp ? `${game.turnedUp.rank}${game.turnedUp.suit}` : '—'}</div>
                    <div className="text-sm text-slate-600">Called by: {game.orderingSeat !== null ? seatLabel(game.orderingSeat) : '—'}</div>
                  </div>
                </div>

                <div className="space-y-2">
                  {iAmHost && game.status === 'lobby' && (
                    <Button className="w-full" onClick={startGame} disabled={!allSeatsFilled}>Start Game</Button>
                  )}
                  {isMyTurn && game.status === 'ordering' && game.settings?.allowGoAlone && (
                    <label className="flex items-center gap-2 text-sm rounded-xl bg-slate-100 p-3 cursor-pointer">
                      <input type="checkbox" checked={goAloneChoice} onChange={(e) => setGoAloneChoice(e.target.checked)} />
                      Go alone this hand
                    </label>
                  )}
                  {isMyTurn && game.status === 'ordering' && game.orderingStage === 'round1' && (
                    <div className="space-y-2">
                      <Button className="w-full" onClick={orderUp}>Order Up {SUIT_NAMES[game.turnedUp?.suit]}</Button>
                      <Button variant="outline" className="w-full" onClick={pass}>Pass</Button>
                    </div>
                  )}
                  {isMyTurn && game.status === 'ordering' && game.orderingStage === 'round2' && (
                    <div className="grid grid-cols-2 gap-2">
                      {SUITS.filter((s) => s !== game.turnedUp?.suit).map((suit) => (
                        <Button key={suit} variant="outline" onClick={() => chooseTrump(suit)}>{SUIT_NAMES[suit]} {suit}</Button>
                      ))}
                      <Button variant="ghost" className="col-span-2" onClick={pass}>Pass</Button>
                    </div>
                  )}
                  {iAmHost && game.status === 'roundEnd' && (
                    <Button className="w-full" onClick={nextHand}>Next Hand</Button>
                  )}
                  {iAmHost && (
                    <Button variant="ghost" className="w-full" onClick={resetGame}><RefreshCcw className="w-4 h-4 mr-2" /> Reset Match</Button>
                  )}
                  {game.status === 'gameover' && (
                    <div className="rounded-2xl bg-emerald-50 text-emerald-900 p-4 text-sm flex items-center gap-2"><Trophy className="w-4 h-4" /> Team {game.winnerTeam === 0 ? '1 (South/North)' : '2 (West/East)'} wins.</div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-3xl border-0 shadow-xl bg-white/95 backdrop-blur">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><MessageCircle className="w-5 h-5" /> Taunt Box</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div ref={scrollRef} className="h-80 overflow-y-auto rounded-2xl bg-slate-100 p-3 space-y-2">
                  {messages.length === 0 ? (
                    <div className="text-sm text-slate-500">No messages yet. Time to emotionally destabilize your family with card-based banter.</div>
                  ) : (
                    messages.map((m) => (
                      <div key={m.id} className="rounded-2xl bg-white p-3 shadow-sm">
                        <div className="text-xs text-slate-500 mb-1">{seatLabel(m.seat)} · {m.name}</div>
                        <div className="text-sm text-slate-800">{m.body}</div>
                      </div>
                    ))
                  )}
                </div>
                <div className="flex gap-2">
                  <Input value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Type a taunt, a plea, or an excuse..." maxLength={280} onKeyDown={(e) => { if (e.key === 'Enter') sendMessage(); }} />
                  <Button onClick={sendMessage}>Send</Button>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-3xl border-0 shadow-xl bg-white/95 backdrop-blur">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Settings2 className="w-5 h-5" /> Rules & Notes</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-slate-700 space-y-3">
                {iAmHost && (
                  <div className="space-y-2 rounded-2xl bg-slate-100 p-4">
                    <div className="font-medium">Host rule toggles</div>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={!!game.settings?.stickDealer} onChange={(e) => updateSettings({ stickDealer: e.target.checked })} />
                      Stick the dealer
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={!!game.settings?.allowGoAlone} onChange={(e) => updateSettings({ allowGoAlone: e.target.checked })} />
                      Allow go alone
                    </label>
                  </div>
                )}
                <div>This version is true 4-human online multiplayer.</div>
                <div>Each player joins on their own computer with a room code.</div>
                <div>Cards are only visible to the player who owns them.</div>
                <div>The table visual shows seat positions and played cards in the center.</div>
                <div>Chat is included because honestly that was the correct call.</div>
                <div>Reconnect handling works by keeping each browser tied to a saved client ID. Refreshing should put the same player back into their seat instead of acting brand new and chaotic.</div>
                <div>Seat changes are lobby-only so nobody rage-swaps positions mid-hand like a tiny card tyrant.</div>
              </CardContent>
            </Card>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function getClientId() {
  let id = localStorage.getItem('euchre_client_id');
  if (!id) {
    id = `client_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    localStorage.setItem('euchre_client_id', id);
  }
  return id;
}

/**
 * SUPABASE SQL
 *
 * create table if not exists public.euchre_rooms (
 *   code text primary key,
 *   host_seat int not null default 0,
 *   created_by text,
 *   game_state jsonb not null,
 *   created_at timestamptz not null default now()
 * );
 *
 * create table if not exists public.euchre_players (
 *   id bigint generated always as identity primary key,
 *   room_code text not null references public.euchre_rooms(code) on delete cascade,
 *   client_id text not null,
 *   seat int not null,
 *   name text not null,
 *   created_at timestamptz not null default now(),
 *   unique(room_code, client_id),
 *   unique(room_code, seat)
 * );
 *
 * create table if not exists public.euchre_messages (
 *   id bigint generated always as identity primary key,
 *   room_code text not null references public.euchre_rooms(code) on delete cascade,
 *   seat int not null,
 *   name text not null,
 *   body text not null,
 *   created_at timestamptz not null default now()
 * );
 *
 * alter table public.euchre_rooms enable row level security;
 * alter table public.euchre_players enable row level security;
 * alter table public.euchre_messages enable row level security;
 *
 * create policy "rooms public read" on public.euchre_rooms for select using (true);
 * create policy "rooms public write" on public.euchre_rooms for all using (true) with check (true);
 *
 * create policy "players public read" on public.euchre_players for select using (true);
 * create policy "players public write" on public.euchre_players for all using (true) with check (true);
 *
 * create policy "messages public read" on public.euchre_messages for select using (true);
 * create policy "messages public write" on public.euchre_messages for all using (true) with check (true);
 */
