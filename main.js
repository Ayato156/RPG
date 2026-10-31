// =========================================================================
// ★ ここから下が、あなたが学習・改造するメインのJavaScript領域です ★
// （UIの書き換えやアニメーション処理は一番下にまとめてあるので、ここはロジックに集中できます！）
// =========================================================================

// =========================================================================
// 【構想3：状態管理の実装】ゲーム全体の状態を管理するオブジェクト（State）
// =========================================================================
const state = {
  turn: 1,
  phase: "player", // 'player'（自分のターン） | 'enemy'（敵のターン）
  isProcessing: false, // アニメーション再生中にボタン連打を防ぐフラグ
  isGameOver: false,

  // プレイヤーの状態
  player: {
    hp: 120,
    maxHp: 120,
    mp: 30,
    maxMp: 30,
    isFever: false, // 確変モード中かどうか
    feverTurns: 0, // 確変モードの残りターン数
    attackBuffTurns: 0, // 【拡張用】攻撃力アップなどのバフ残りターン数
    isCharged: false,
  },

  // 敵の状態
  enemy: {
    hp: 200,
    maxHp: 200,
    defenseDbuffTurns: 0,
    healCount: 4,
  },
};

// =========================================================================
// 【構想1：コマンドと確率計算】技（スキル）のデータ定義
// =========================================================================
const skills = {
  normal: {
    name: "たたかう",
    baseDamage: 18,
    hitRate: 90, // 命中率（%）
    critRate: 15, // 会心（クリティカル）率（%）
  },
  heavy: {
    name: "まじんぎり",
    baseDamage: 32,
    hitRate: 50, // 当たりにくいが大ダメージ＆高クリティカル
    critRate: 45,
  },

  charge: { name: "ためる", type: "charge" },
  mera: {
    name: "メラ",
    baseDamage: 25,
    hitRate: 100,
    critRate: 5,
    mpCost: 5,
    type: "attack",
  },
  hoimi: { name: "ホイミ", healAmount: 40, mpCost: 5, type: "heal" },
  baikiruto: { name: "バイキルト", mpCost: 5, type: "buff" },
  rukani: { name: "ルカニ", mpCost: 5, type: "debuff" },
};

// =========================================================================
// 確率計算用のユーティリティ関数（100面ダイス）
// =========================================================================

/**
 * 1〜100までの乱数（100面ダイス）を振る関数
 */
function rollDice100() {
  return Math.floor(Math.random() * 100) + 1;
}

/**
 * 指定した確率（%）で成功するかを判定する関数
 * 例: checkProbability(30) なら 30% の確率で true を返す
 */
function checkProbability(percent) {
  const dice = rollDice100();
  return dice <= percent;
}

// =========================================================================
// バトルのターン進行管理（自分のターン → 間を空ける → 敵のターン）
// ※アニメーションの「間（ウェイト）」を作るために async / await を使っています
// =========================================================================
async function handlePlayerCommand(skillKey) {
  // 処理中やゲーム終了時はボタンを押せないようにガード
  if (state.isProcessing || state.isGameOver) return;

  const skill = skills[skillKey];

  if (skill.mpCost && state.player.mp < skill.mpCost) {
    addLog(`MPが足りない!`);
    return;
  }

  if (skill.mpCost) {
    state.player.mp -= skill.mpCost;
  }

  openMenu("main");

  state.isProcessing = true;
  state.phase = "player";
  updateUI();

  addLog(`▼ ターン ${state.turn}：あなたの行動`, "log-turn");

  // --- 1. プレイヤーの攻撃処理を実行 ---
  await executePlayerAttack(skillKey);
  updateUI();

  // 敵のHPが0以下になったら勝利！
  if (checkBattleEnd()) {
    state.isProcessing = false;
    updateUI();
    return;
  }

  // --- 2. 自分のターンと敵のターンの間に「0.8秒の間」を作る ---
  await wait(800);
  state.phase = "enemy";
  updateUI();

  // --- 3. 敵のAI行動を実行 ---
  await executeEnemyTurn();
  updateUI();

  // プレイヤーのHPが0以下になったら敗北…
  if (checkBattleEnd()) {
    state.isProcessing = false;
    updateUI();
    return;
  }

  // --- 4. ターン終了時の状態更新（確変やバフの残りターンを減らす） ---
  await wait(600);
  processTurnEnd();

  // 再びプレイヤーのコマンド入力を受け付ける
  state.phase = "player";
  state.isProcessing = false;
  updateUI();
}

// =========================================================================
// 【構想1 & 2：プレイヤーの攻撃処理・確率計算・確変システムの拡張ポイント】
// =========================================================================
async function executePlayerAttack(skillKey) {
  const skill = skills[skillKey];
  addLog(`ゆうしゃの「${skill.name}」！`);
  await wait(400);

  //特殊技の処理
  if (skill.type === "charge") {
    state.player.isCharged = true;
    addLog(`ゆうしゃはチカラをためている! 次の攻撃ダメージは2倍!`);
    return;
  }
  if (skill.type === "heal") {
    state.player.hp = Math.min(
      state.player.maxHp,
      state.player.hp + skill.healAmount,
    );
    addLog(`ゆうしゃのHPが${skill.healAmount}回復した!`);
    await wait(300);
    return;
  }
  if (skill.type === "buff") {
    state.player.attackBuffTurns = 4;
    addLog(`ゆうしゃの攻撃力がアップした！ (3ターン)`);
    return;
  }
  if (skill.type === "debuff") {
    // ★ 命中率40%の判定
    if (checkProbability(40)) {
      state.enemy.defenseDebuffTurns = 4;
      addLog(`キングスライムの防御力が下がった！ (3ターン)`);
    } else {
      await playMissEffect(); // ミス演出
      addLog(
        `しかし キングスライムには効かなかった！ (命中率:40%)`,
        "log-miss",
      );
    }
    return;
  }

  // --- ステップA: 命中判定 ---
  // 【拡張アイデア】確変中（state.player.isFever が true の時）は必中（100%）にする改造もおすすめ！
  const hitChance = state.player.isFever ? 100 : skill.hitRate;
  const isHit = checkProbability(hitChance);

  if (!isHit) {
    await playMissEffect(); // ミス演出を再生
    addLog(
      `ミス！ キングスライムにダメージを与えられない！ (命中率:${skill.hitRate}%)`,
      "log-miss",
    );
    return;
  }

  // --- ステップB: 会心（クリティカル）判定 & 確変システム連動 ---
  let currentCritRate = skill.critRate;

  // 【構想2：確変システムの拡張ポイント①】
  // 現在：確変モード中なら会心率を「80%」に大幅アップしています。
  // TODO: 確変中に会心が出たらさらに威力を3倍にする、確変ターンが1ターン延びるなど改造してみましょう！
  if (state.player.isFever) {
    currentCritRate = 80;
  }

  const isCrit = checkProbability(currentCritRate);

  // --- ステップC: ダメージ計算 ---
  let damage = skill.baseDamage;

  //バフデバフためるのダメージ計算
  if (state.player.isCharged) {
    damage = Math.floor(damage * 2.0);
    state.player.isCharged = false;
  }
  if (state.player.attackBuffTurns > 0) {
    damage = Math.floor(damage * 1.25);
  }
  if (state.enemy.defenseDebuffTurns > 0) {
    damage = Math.floor(damage * 1.7);
  }

  if (isCrit) {
    damage = Math.floor(damage * 2.0); // 会心の一撃はダメージ2倍
    addLog(`⚡ かいしんの一撃！！ (判定確率:${currentCritRate}%)`, "log-crit");
  }

  // 敵のHPを減らす
  state.enemy.hp = Math.max(0, state.enemy.hp - damage);

  // 斬撃アニメーション＆ダメージポップアップを表示
  await playSlashOnEnemy(damage, isCrit);
  addLog(`キングスライムに ${damage} のダメージを与えた！`);

  // --- ステップD: 確変モード突入の抽選 ---
  // 【構想2：確変システムの拡張ポイント②】
  const feverTriggerChance = 5; // スキル固有の確率がなければ10%で抽選

  if (
    !state.player.isFever &&
    state.enemy.hp > 0 &&
    checkProbability(feverTriggerChance)
  ) {
    await wait(300);
    state.player.isFever = true;
    state.player.feverTurns = 4; // 3ターンの間、確変モード継続
    addLog(
      `🔥【確変突入】運命の扉が開いた！3ターンの間、どの技も必中＆会心率が80%に激増！`,
      "log-fever",
    );
  }
}

// =========================================================================
// 【構想4：敵のAI行動】内部のダイス（乱数）で敵の行動を決定する箇所
// =========================================================================
async function executeEnemyTurn() {
  addLog(`▼ キングスライムのターン！`, "log-enemy");
  await wait(450);

  // 1〜100のダイスを振る
  const aiDice = rollDice100();

  // 敵のHPが50%以上かどうかをチェック（true か false が入る）
  const isHpHigh = state.enemy.hp >= state.enemy.maxHp * 0.5;

  let actionType = ""; // どの行動をするかを入れる箱

  // ==========================================
  // ① 行動パターンの決定
  // ==========================================
  if (isHpHigh) {
    // 【HPが50%以上のとき】
    if (aiDice <= 30) {
      actionType = "heavy"; // 30%で強攻撃 (1〜30)
    } else {
      actionType = "normal"; // 70%で弱攻撃 (31〜100)
    }
  } else {
    // 【HPが50%未満のとき】
    if (aiDice <= 30) {
      // 残り回数があれば回復、使い切っていたら通常攻撃へ切り替え
      if (state.enemy.healCount > 0) {
        actionType = "heal";
      } else {
        actionType = "normal";
      }
    } else if (aiDice <= 50) {
      actionType = "heavy"; // 20%で強攻撃 (31〜50)
    } else {
      actionType = "normal"; // 50%で弱攻撃 (51〜100)
    }
  }

  // ==========================================
  // ② 決定した行動の実行
  // ==========================================
  if (actionType === "heal") {
    const healAmount = 60;
    state.enemy.hp = Math.min(state.enemy.maxHp, state.enemy.hp + healAmount);
    addLog(
      `キングスライムは「ベホイミ」をとなえた！ HPが ${healAmount} 回復！ (AI:${aiDice})`,
    );
  } else if (actionType === "heavy") {
    addLog(`キングスライムの おしつぶすこうげき！ (AI:${aiDice})`);
    await wait(400); // 少しタメを作る

    // 強攻撃は外れやすい（命中率50%と設定）
    if (checkProbability(50)) {
      const heavyDmg = 35;
      state.player.hp = Math.max(0, state.player.hp - heavyDmg);
      await playEnemyAttackEffect();
      addLog(`痛恨の一撃！ ゆうしゃに ${heavyDmg} の大ダメージ！`, "log-enemy");
    } else {
      addLog(`しかし ゆうしゃ はひらりと身をかわした！`);
    }
  } else if (actionType === "normal") {
    addLog(`キングスライムの体当たり！ (AI:${aiDice})`);
    await wait(300); // 少しタメを作る

    // 命中率80%（20%の確率で外れる）
    if (checkProbability(80)) {
      const normalDmg = 15;
      state.player.hp = Math.max(0, state.player.hp - normalDmg);
      await playEnemyAttackEffect();
      addLog(`ゆうしゃに ${normalDmg} のダメージ！`, "log-enemy");
    } else {
      addLog(`しかし 攻撃は外れた！`);
    }
  }
}

// =========================================================================
// 【構想3：状態管理の実装】ターン経過による確変・バフのカウントダウン処理
// =========================================================================
function processTurnEnd() {
  state.turn += 1;

  // 確変モードの残りターンを減らす処理
  if (state.player.isFever) {
    state.player.feverTurns -= 1;

    if (state.player.feverTurns <= 0) {
      state.player.isFever = false;
      addLog(`✨ 確変モードの効果が切れた…。`);
    }
  }

  // 攻撃力バフのターン経過と終了通知
  if (state.player.attackBuffTurns > 0) {
    state.player.attackBuffTurns -= 1;
    if (state.player.attackBuffTurns <= 0) {
      addLog(`🔻 ゆうしゃの攻撃力アップの効果が切れた。`);
    }
  }

  // 敵の防御デバフのターン経過と終了通知
  if (state.enemy.defenseDebuffTurns > 0) {
    state.enemy.defenseDebuffTurns -= 1;
    if (state.enemy.defenseDebuffTurns <= 0) {
      addLog(`🛡️ キングスライムの防御力が元に戻った。`);
    }
  }
} // ← これが processTurnEnd 関数全体を閉じるカッコです

// =========================================================================
// 勝敗判定・ゲームリセット処理
// =========================================================================
// =========================================================================
// 勝敗判定・ゲームリセット処理
// =========================================================================
function checkBattleEnd() {
  if (state.enemy.hp <= 0) {
    addLog(`🎉 キングスライムをやっつけた！ ゆうしゃの勝利！`, "log-crit");
    state.isGameOver = true;
    showResultModal(true); // ★ ここで勝利モーダルを呼ぶ
    return true;
  }
  if (state.player.hp <= 0) {
    addLog(`💀 ゆうしゃは力尽きてしまった… ゲームオーバー。`, "log-enemy");
    state.isGameOver = true;
    showResultModal(false); // ★ ここで敗北モーダルを呼ぶ
    return true;
  }
  return false;
}

// ★ モーダル表示用関数
function showResultModal(isWin) {
  setTimeout(() => {
    const modal = document.getElementById("result-modal");
    const title = document.getElementById("result-title");
    const text = document.getElementById("result-text");
    const turns = document.getElementById("result-turns");

    if (turns) turns.textContent = state.turn;

    if (isWin) {
      title.textContent = "★ VICTORY ★";
      title.className = "victory";
      text.textContent = "キングスライムを討伐した！";
    } else {
      title.textContent = "GAME OVER";
      title.className = "defeat";
      text.textContent = "ゆうしゃは力尽きてしまった…";
    }

    if (modal) modal.style.display = "flex";
  }, 800);
}
function resetGame() {
  if (state.isProcessing) return; // アニメーション中はリセット不可
  const modal = document.getElementById("result-modal");
  if (modal) modal.style.display = "none";

  state.turn = 1;
  state.phase = "player";
  state.isGameOver = false;
  state.player.hp = state.player.maxHp;
  state.player.mp = state.player.maxMp;
  state.player.isFever = false;
  state.player.feverTurns = 0;
  state.player.attackBuffTurns = 0;
  state.player.isCharged = false;
  state.enemy.hp = state.enemy.maxHp;
  state.enemy.defenseDebuffTurns = 0;
  state.enemy.healCount = 4;

  document.getElementById("battle-log").innerHTML = "";
  addLog("野生の キングスライム があらわれた！ コマンドを選択してください。");
  updateUI();
}

//メニューの表示非常時//
//メニューの改装切り替え
function openMenu(menuType) {
  if (state.isProcessing || state.isGameOver) return;
  const mainMenu = document.getElementById("menu-main");
  const attackMenu = document.getElementById("menu-attack");
  const magicMenu = document.getElementById("menu-magic");

  mainMenu.style.display = "none";
  attackMenu.style.display = "none";
  magicMenu.style.display = "none";

  if (menuType === "attack") {
    attackMenu.style.display = "block";
  } else if (menuType === "magic") {
    magicMenu.style.display = "block";
  } else {
    mainMenu.style.display = "block";
  }
}

// =========================================================================
// ▼ ここから下は【UI描画・エフェクト演出用の裏方コード】です ▼
// ※ここは既に完成しているので、学習中は無理に読んだり編集したりしなくて大丈夫です！
// =========================================================================

/**
 * 指定したミリ秒だけ処理を待つ関数（ターンの間を作るために使用）
 */
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 敵への斬撃エフェクト＆ダメージポップアップ演出
 */
async function playSlashOnEnemy(damage, isCrit) {
  const slashEl = document.getElementById("slash-effect");
  const enemySprite = document.getElementById("enemy-sprite");
  const popupEl = document.getElementById("damage-popup");
  const gameScreen = document.getElementById("game-screen");

  // 斬撃エフェクト表示
  slashEl.classList.remove("active");
  void slashEl.offsetWidth; // リフローさせてアニメーションを再発火
  slashEl.classList.add("active");

  if (isCrit) {
    gameScreen.classList.add("crit-flash");
    setTimeout(() => gameScreen.classList.remove("crit-flash"), 400);
  }

  await wait(150);

  // 敵の点滅とダメージ数字ポップアップ
  enemySprite.classList.add("enemy-hit");
  popupEl.textContent = damage;
  popupEl.className = `damage-popup show ${isCrit ? "crit" : ""}`;

  updateUI(); // HPバーをここでスッと減らす

  await wait(450);
  enemySprite.classList.remove("enemy-hit");
}

/**
 * 攻撃ミス時のポップアップ演出
 */
async function playMissEffect() {
  const popupEl = document.getElementById("damage-popup");
  popupEl.textContent = "MISS!";
  popupEl.className = "damage-popup miss show";
  await wait(500);
}

/**
 * 敵の攻撃モーション＆画面シェイク演出
 */
async function playEnemyAttackEffect() {
  const enemySprite = document.getElementById("enemy-sprite");
  const gameScreen = document.getElementById("game-screen");

  enemySprite.classList.add("enemy-attack-motion");
  await wait(220);

  // 画面全体をガタガタ揺らす（ドラクエ風の被弾演出）
  gameScreen.classList.remove("screen-shake");
  void gameScreen.offsetWidth;
  gameScreen.classList.add("screen-shake");

  updateUI(); // プレイヤーのHPバーを減らす
  await wait(350);
  enemySprite.classList.remove("enemy-attack-motion");
}

/**
 * state（状態）の数値をHTML画面のゲージや文字に反映する関数
 */
function updateUI() {
  // 1. プレイヤー・敵のHP数値とバーの幅を更新
  document.getElementById("player-hp").textContent = state.player.hp;
  document.getElementById("player-max-hp").textContent = state.player.maxHp;
  const playerHpPercent = (state.player.hp / state.player.maxHp) * 100;
  const playerBar = document.getElementById("player-hp-bar");
  playerBar.style.width = `${playerHpPercent}%`;
  playerBar.classList.toggle("low", playerHpPercent <= 30);

  // ▼ ★ここに追加：MPの数値とバーの更新
  document.getElementById("player-mp").textContent = state.player.mp;
  document.getElementById("player-max-mp").textContent = state.player.maxMp;
  const playerMpPercent = (state.player.mp / state.player.maxMp) * 100;
  const playerMpBar = document.getElementById("player-mp-bar");
  playerMpBar.style.width = `${playerMpPercent}%`;
  playerMpBar.classList.toggle("low", playerMpPercent <= 30);

  document.getElementById("enemy-hp").textContent = state.enemy.hp;
  document.getElementById("enemy-max-hp").textContent = state.enemy.maxHp;
  document.getElementById("player-mp").textContent = state.player.mp;
  document.getElementById("player-max-mp").textContent = state.player.maxMp;
  const enemyHpPercent = (state.enemy.hp / state.enemy.maxHp) * 100;
  const enemyBar = document.getElementById("enemy-hp-bar");
  enemyBar.style.width = `${enemyHpPercent}%`;
  enemyBar.classList.toggle("low", enemyHpPercent <= 30);

  // 敵が倒れたら半透明にする
  document.getElementById("enemy-sprite").style.opacity =
    state.enemy.hp <= 0 ? "0.2" : "1";

  // 2. ターン数と現在の行動フェーズ表示
  document.getElementById("turn-count").textContent = state.turn;
  const phaseEl = document.getElementById("phase-indicator");
  if (state.isGameOver) {
    phaseEl.textContent = "バトル終了";
    phaseEl.className = "phase-badge";
  } else if (state.phase === "player") {
    phaseEl.textContent = "あなたのターン";
    phaseEl.className = "phase-badge phase-player";
  } else {
    phaseEl.textContent = "敵のターン";
    phaseEl.className = "phase-badge phase-enemy";
  }

  // 3. 確変モードとバフの表示切り替え
  const stateBadge = document.getElementById("player-state-badge");
  const gameScreen = document.getElementById("game-screen");

  if (state.player.isFever) {
    stateBadge.textContent = `🔥確変中 (残${state.player.feverTurns}T)`;
    stateBadge.className = "status-badge fever";
    gameScreen.classList.add("fever-mode");
  } else {
    // ★ ここに「確変 5%」を明記
    stateBadge.textContent = "全行動の確変発生率 5%";
    stateBadge.className = "status-badge";
    gameScreen.classList.remove("fever-mode");
  }

  // プレイヤーの攻撃力バフ
  const buffBadge = document.getElementById("player-buff-badge");
  if (state.player.attackBuffTurns > 0) {
    buffBadge.style.display = "inline-block";
    buffBadge.textContent = `⚔️攻撃UP (${state.player.attackBuffTurns}T)`;
  } else {
    buffBadge.style.display = "none";
  }

  // ★ ここを追加：敵の防御力デバフ
  const enemyDebuffBadge = document.getElementById("enemy-debuff-badge");
  if (enemyDebuffBadge) {
    if (state.enemy.defenseDebuffTurns > 0) {
      enemyDebuffBadge.style.display = "inline-block";
      enemyDebuffBadge.textContent = `🛡️防御DOWN (${state.enemy.defenseDebuffTurns}T)`;
    } else {
      enemyDebuffBadge.style.display = "none";
    }
  }

  // 4. 敵のターン中やゲーム終了時はコマンドボタンをロック
  const actionButtons = ["btn-normal", "btn-heavy"];
  const shouldDisable = state.isProcessing || state.isGameOver;
  actionButtons.forEach((id) => {
    document.getElementById(id).disabled = shouldDisable;
  });
}

/**
 * バトルログにメッセージを追加する関数
 */
function addLog(message, className = "") {
  const logContainer = document.getElementById("battle-log");
  const line = document.createElement("div");
  line.className = `log-line ${className}`;
  line.textContent = message;
  logContainer.appendChild(line);

  const maxLogs = 5;
  while (logContainer.children.length > maxLogs) {
    logContainer.removeChild(logContainer.firstChild);
  }
  logContainer.scrollTop = logContainer.scrollHeight;
}

// 初回読み込み時にゲームを初期化
window.onload = function () {
  resetGame();
};
