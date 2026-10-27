const gameWorkspace = document.querySelector('.workspace-frame');
const gameCanvas = document.querySelector('.arena-canvas');
const gameContext = gameCanvas?.getContext('2d');
const minimapCanvas = document.querySelector('.minimap-canvas');
const minimapContext = minimapCanvas?.getContext('2d');
const gameSetup = document.querySelector('.game-setup');
const arenaScreen = document.querySelector('.arena-screen');
const gameMessage = document.querySelector('.game-message');
const playButton = document.querySelector('.play-match');
const nextRoundButton = document.querySelector('.next-round');
const backToCodeButton = document.querySelector('.back-to-code');
const roundNumberLabel = document.querySelector('.round-number');
const arenaRoundLabel = document.querySelector('.arena-round-number');
const playerTabs = Array.from(document.querySelectorAll('.player-tab'));

if (gameWorkspace && gameCanvas && gameContext && gameSetup && arenaScreen) {
  const palette = document.querySelector('.blocksCont');
  const categoryNav = document.querySelector('.block-category-nav');
  const canvasWidth = gameCanvas.width;
  const canvasHeight = gameCanvas.height;
  const obstacles = [
    { x: canvasWidth * 0.42, y: canvasHeight * 0.28, width: 40, height: 36 },
    { x: canvasWidth * 0.58, y: canvasHeight * 0.72, width: 40, height: 36 },
    { x: canvasWidth * 0.48, y: canvasHeight * 0.52, width: 52, height: 36 },
  ];
  const budgetStart = 10;
  const budgetPerRound = 3;
  const maxRounds = 3;
  const codeStepDelay = 0.7;
  const actionCosts = {
    start: 0, wait: 1, move: 1, rotate: 1, repeat: 0, if: 1,
    'wait until': 1, 'repeat until': 1, fire: 2, jump: 2,
    'self-destruct': 3, shield: 3, reload: 0, 'place mine': 2,
  };
  let mode = null;
  let currentPlayer = 0;
  let activeRound = 1;
  let programs = [null, null];
  let activeCodeRows = [new Map(), new Map()];
  let tanks = [];
  let bullets = [];
  let mines = [];
  let animationFrame = 0;
  let isRunning = false;
  let lastFrameTime = 0;
  let roundStartedAt = 0;
  let roundOver = false;
  let matchOver = false;
  let healthBetweenRounds = [3, 3];
  const roundDuration = 25;

  const escapeSelectorValue = (value) => window.CSS?.escape
    ? CSS.escape(value)
    : value.replace(/[^a-zA-Z0-9_-]/g, '\\$&');

  const currentBudget = () => budgetStart + (activeRound - 1) * budgetPerRound;

  const setStatus = (message) => {
    if (gameMessage) gameMessage.textContent = message;
    const arenaStatus = document.querySelector('.arena-status');
    if (arenaStatus) arenaStatus.textContent = message;
  };

  const updatePlayerTabs = () => {
    playerTabs.forEach((tab, index) => {
      tab.hidden = mode !== 'duel' && index === 1;
      tab.classList.toggle('is-active', index === currentPlayer);
      tab.setAttribute('aria-selected', String(index === currentPlayer));
    });
    if (window.codeClashSetActionLimit) window.codeClashSetActionLimit(currentBudget());
    const used = Number(document.querySelector('.actions-used')?.textContent || 0);
    if (playButton) {
      playButton.disabled = used > currentBudget() || (mode === 'duel' && !programs[1]);
      playButton.style.border = mode === 'duel'
        ? (programs[1] ? '2px solid green' : 'none')
        : '2px solid green';
    }
  };

  const setMode = (selectedMode) => {
    mode = selectedMode;
    currentPlayer = 0;
    activeRound = 1;
    programs = [null, null];
    gameSetup.hidden = true;
    arenaScreen.hidden = true;
    gameWorkspace.classList.add('is-planning');
    setStatus(selectedMode === 'solo'
      ? 'Build your program, then run it against the training bot.'
      : 'Build Player 1’s program. Player 2 can take over the same editor next.');
    updatePlayerTabs();
    drawMinimap();
  };

  document.querySelectorAll('.mode-choice').forEach((button) => {
    button.addEventListener('click', () => setMode(button.dataset.mode));
  });

  const copyProgram = (source, destination) => {
    const cloneWithFormState = (element) => {
      const clone = element.cloneNode(true);
      const sourceControls = element.querySelectorAll('input, select, textarea');
      const clonedControls = clone.querySelectorAll('input, select, textarea');
      sourceControls.forEach((control, index) => {
        const clonedControl = clonedControls[index];
        if (!clonedControl) return;
        clonedControl.value = control.value;
        if ('checked' in control) clonedControl.checked = control.checked;
      });
      return clone;
    };

    destination.replaceChildren(...Array.from(source.children).map(cloneWithFormState));
  };

  const saveCurrentProgram = () => {
    const canvas = gameWorkspace.querySelector('.workspace-canvas');
    if (!canvas) return;
    const program = document.createElement('div');
    copyProgram(canvas, program);
    programs[currentPlayer] = program;
  };

  const restoreCurrentProgram = () => {
    const canvas = gameWorkspace.querySelector('.workspace-canvas');
    if (!canvas) return;
    canvas.replaceChildren();
    if (programs[currentPlayer]) copyProgram(programs[currentPlayer], canvas);
    canvas.querySelectorAll('.block').forEach((block) => { block.draggable = true; });
    window.codeClashRefreshActions?.();
    updatePlayerTabs();
  };

  playerTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const targetPlayer = Number(tab.dataset.player);
      if (targetPlayer === currentPlayer || (mode !== 'duel' && targetPlayer !== 0)) return;
      saveCurrentProgram();
      currentPlayer = targetPlayer;
      restoreCurrentProgram();
      setStatus(`Build Player ${currentPlayer + 1}’s program. The action limit is ${currentBudget()}.`);
    });
  });

  const costOf = (block) => Number(block.dataset.cost) || 0;
  const costTree = (block) => {
    const body = block.querySelector(':scope > .wrap-contents');
    const children = body
      ? Array.from(body.children).filter((child) => child.matches('.block'))
      : [];
    const childrenCost = children.reduce((sum, child) => sum + costTree(child), 0);
    if (block.dataset.blockName === 'repeat') {
      const input = Number(block.querySelector(':scope > .block-header input')?.value) || 0;
      return costOf(block) + childrenCost * Math.max(0, input);
    }
    return costOf(block) + childrenCost;
  };
  const programCost = (root) => Array.from(root.children)
    .filter((block) => block.matches('.block'))
    .reduce((sum, block) => sum + costTree(block), 0);

  const readInput = (block) => {
    const input = block.querySelector(':scope > .block-header input');
    return input ? input.value : '';
  };

  const findWrapBody = (block) => block.querySelector(':scope > .wrap-contents');

  const readExpression = (block) => {
    const input = block.querySelector(':scope > .block-header > .expression-input');
    const expressionBlock = input?.querySelector(':scope > .block');
    return expressionBlock ? readExpressionBlock(expressionBlock) : null;
  };

  const readExpressionBlock = (block) => {
    const name = block.dataset.blockName;
    if (block.dataset.blockType === 'variable') {
      return { kind: 'value', name, value: readInput(block) };
    }
    if (block.dataset.blockType !== 'operator') return null;
    const operands = Array.from(block.querySelectorAll(':scope > .block-header > .operand-input'))
      .map((operand) => {
        const child = operand.querySelector(':scope > .block');
        return child ? readExpressionBlock(child) : null;
      });
    return { kind: 'operator', name, left: operands[0], right: operands[1] };
  };

  const valueFor = (expression, tank, enemy) => {
    if (!expression) return 0;
    if (expression.kind === 'value') {
      if (expression.name === 'health') return tank.health;
      if (expression.name === 'ammo') return tank.ammo;
      if (expression.name === 'enemy distance') {
        return Math.round(Math.hypot(enemy.x - tank.x, enemy.y - tank.y) / 40);
      }
      if (expression.name === 'damage received') return tank.damageReceived;
      return Number(expression.value) || 0;
    }
    if (expression.kind === 'operator') return evaluate(expression, tank, enemy);
    return 0;
  };

  const evaluate = (expression, tank, enemy) => {
    if (!expression) return false;
    if (expression.kind !== 'operator') return Boolean(valueFor(expression, tank, enemy));
    const left = valueFor(expression.left, tank, enemy);
    const right = valueFor(expression.right, tank, enemy);
    switch (expression.name) {
      case '>': return Number(left) > Number(right);
      case '<': return Number(left) < Number(right);
      case '=': return left === right || Number(left) === Number(right);
      case 'and': return Boolean(left) && Boolean(right);
      default: return false;
    }
  };

  const makeInstruction = (block) => {
    const name = block.dataset.blockName;
    const instruction = { name, input: readInput(block), source: block };
    const dropdown = block.querySelector(':scope > .block-header > select');
    instruction.direction = dropdown?.value || '';
    instruction.expression = readExpression(block);
    const body = findWrapBody(block);
    instruction.children = body
      ? Array.from(body.children).filter((child) => child.matches('.block')).map(makeInstruction)
      : [];
    return instruction;
  };

  const instructionLabel = (instruction) => {
    if (instruction.name === 'rotate') {
      const degrees = instruction.direction === 'right' ? '-90°'
        : instruction.direction === '180' ? '180°' : '90°';
      return `rotate ${degrees}`;
    }
    if (instruction.name === 'wait' || instruction.name === 'repeat') {
      return `${instruction.name} ${instruction.input || '0'}`;
    }
    return instruction.name || 'number';
  };

  const expressionLabel = (expression) => {
    if (!expression) return 'condition missing';
    if (expression.kind === 'value') {
      return expression.name || expression.value || 'number';
    }
    return `${expressionLabel(expression.left)} ${expression.name} ${expressionLabel(expression.right)}`;
  };

  const drawProgramPanel = (player, instructions) => {
    const panel = document.querySelector(player === 0 ? '.player-one-playback' : '.player-two-playback');
    const lines = panel?.querySelector('.code-lines');
    if (!lines) return;
    lines.replaceChildren();
    activeCodeRows[player] = new Map();
    const appendInstructions = (items, depth = 0) => {
      items.forEach((instruction) => {
        const row = document.createElement('div');
        row.className = 'code-line';
        row.style.paddingLeft = `${6 + depth * 10}px`;
        row.textContent = `${depth ? '↳ ' : ''}${instructionLabel(instruction)}`;
        lines.appendChild(row);
        activeCodeRows[player].set(instruction.source || instruction, row);
        if (instruction.expression) row.textContent += ` · ${expressionLabel(instruction.expression)}`;
        appendInstructions(instruction.children || [], depth + 1);
      });
    };
    appendInstructions(instructions);
    if (!instructions.length) {
      const empty = document.createElement('div');
      empty.className = 'code-line';
      empty.textContent = 'No executable blocks';
      lines.appendChild(empty);
    }
  };

  const clearProgramPanels = () => {
    [0, 1].forEach((player) => {
      const panel = document.querySelector(player === 0 ? '.player-one-playback' : '.player-two-playback');
      panel?.querySelector('.code-lines')?.replaceChildren();
      activeCodeRows[player].clear();
    });
  };

  const highlightInstruction = (tank, instruction, detail) => {
    const rows = activeCodeRows[tank.player];
    rows.forEach((row) => row.classList.remove('is-active'));
    const row = rows.get(instruction.source || instruction);
    if (row) {
      row.classList.add('is-active');
      row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    const who = tank.isBot ? 'CPU' : `Player ${tank.player + 1}`;
    const arenaStatus = document.querySelector('.arena-status');
    if (arenaStatus) arenaStatus.textContent = `${who}: ${detail}`;
  };

  const compileProgram = (root) => {
    const topLevelBlocks = Array.from(root.children)
      .filter((block) => block.matches('.block'))
      .sort((first, second) => first.offsetTop - second.offsetTop);
    const startBlock = topLevelBlocks.find((block) => block.classList.contains('start'));
    if (!startBlock) return [];

    const stack = [startBlock];
    let previousBlock = startBlock;
    const startIndex = topLevelBlocks.indexOf(startBlock);
    for (let index = startIndex + 1; index < topLevelBlocks.length; index += 1) {
      const nextBlock = topLevelBlocks[index];
      if (nextBlock.offsetLeft !== startBlock.offsetLeft
        || nextBlock.offsetTop > previousBlock.offsetTop + previousBlock.offsetHeight + 8) break;
      stack.push(nextBlock);
      previousBlock = nextBlock;
    }
    return stack.map(makeInstruction);
  };

  const randomBotProgram = () => [
    { name: 'rotate', direction: 'left', children: [] },
    { name: 'move', children: [] },
    { name: 'fire', children: [] },
    { name: 'move', children: [] },
    { name: 'fire', children: [] },
  ];

  const createTank = (player, program, isBot = false, health = 3, actions = currentBudget()) => ({
    player,
    x: player === 0 ? 150 : canvasWidth - 150,
    y: canvasHeight / 2,
    angle: player === 0 ? 0 : Math.PI,
    health,
    actionsRemaining: actions,
    ammo: 3,
    damageReceived: 0,
    shield: 0,
    program,
    executionStack: [{ instructions: program, index: 0 }],
    programDone: false,
    current: null,
    cooldown: 0,
    pendingWait: null,
    flash: 0,
    isBot,
    color: player === 0 ? '#4ad5f2' : '#ff766f',
  });

  const keepInArena = (tank) => {
    tank.x = Math.min(canvasWidth - 36, Math.max(36, tank.x));
    tank.y = Math.min(canvasHeight - 36, Math.max(36, tank.y));
  };

  const collidesWithObstacle = (x, y) => obstacles.some((obstacle) => (
    Math.abs(x - obstacle.x) < obstacle.width / 2 + 20
      && Math.abs(y - obstacle.y) < obstacle.height / 2 + 17
  ));

  const updateHealth = () => {
    const first = tanks[0];
    const second = tanks[1];
    document.querySelector('.p1-health').textContent = String(Math.max(0, first?.health ?? 3));
    document.querySelector('.p2-health').textContent = String(Math.max(0, second?.health ?? 3));
    [first, second].forEach((tank, index) => {
      const actions = document.querySelector(`.p${index + 1}-actions`);
      if (!actions) return;
      actions.textContent = String(Math.max(0, tank?.actionsRemaining ?? currentBudget()));
      actions.classList.toggle('is-empty', (tank?.actionsRemaining ?? 0) <= 0);
    });
  };

  const spendActions = (tank, instruction) => {
    if (tank.actionsRemaining <= 0) {
      tank.programDone = true;
      tank.executionStack.length = 0;
      setStatus(`${tank.isBot ? 'CPU' : `Player ${tank.player + 1}`} ran out of actions. Remaining code was skipped.`);
      return false;
    }
    const cost = Number.isFinite(instruction.cost)
      ? instruction.cost
      : (actionCosts[instruction.name] ?? 0);
    if (cost > tank.actionsRemaining) {
      tank.programDone = true;
      tank.executionStack.length = 0;
      highlightInstruction(tank, instruction, `not enough actions (${cost} needed)`);
      setStatus(`${tank.isBot ? 'CPU' : `Player ${tank.player + 1}`} needs ${cost} actions but has ${tank.actionsRemaining}. Remaining code was skipped.`);
      return false;
    }
    tank.actionsRemaining -= cost;
    updateHealth();
    return true;
  };

  const finishRound = (winner) => {
    isRunning = false;
    roundOver = true;
    healthBetweenRounds = tanks.map((tank) => Math.max(0, tank.health));
    if (mode === 'solo') {
      setStatus(winner === 0 ? 'You win the test match!' : 'The training bot wins this test.');
      matchOver = true;
      nextRoundButton.hidden = true;
    } else if (healthBetweenRounds.some((health) => health <= 0)) {
      matchOver = true;
      if (healthBetweenRounds[0] <= 0 && healthBetweenRounds[1] <= 0) {
        setStatus('Both tanks were destroyed. The match is a draw.');
      } else {
        const defeated = healthBetweenRounds.findIndex((health) => health <= 0);
        setStatus(`Player ${defeated + 1} is out of health. Player ${2 - defeated} wins the match!`);
      }
      nextRoundButton.hidden = true;
    } else if (activeRound >= maxRounds) {
      matchOver = true;
      const overallWinner = healthBetweenRounds[0] > healthBetweenRounds[1] ? 0
        : healthBetweenRounds[1] > healthBetweenRounds[0] ? 1 : null;
      setStatus(overallWinner === null ? 'Three rounds complete — the match is a draw.'
        : `Three rounds complete — Player ${overallWinner + 1} wins the match!`);
      nextRoundButton.hidden = true;
    } else {
      setStatus(winner === null
        ? `Round ${activeRound} ends. Health is tied — adjust your program for the next round.`
        : `Player ${winner + 1} wins round ${activeRound}. Health carries into the next round.`);
      nextRoundButton.textContent = `Next round (+${budgetPerRound} actions)`;
      nextRoundButton.hidden = false;
    }
    backToCodeButton.hidden = false;
  };

  const nextInstruction = (tank) => {
    if (tank.current || tank.cooldown > 0 || tank.health <= 0 || tank.programDone) return;
    if (tank.actionsRemaining <= 0) {
      spendActions(tank, { name: 'remaining code', cost: 0 });
      return;
    }
    const enemy = tanks[1 - tank.player];

    if (tank.pendingWait) {
      const { instruction } = tank.pendingWait;
      if (!evaluate(instruction.expression, tank, enemy)) {
        tank.cooldown = codeStepDelay;
        highlightInstruction(tank, instruction, 'waiting for condition to become true');
        return;
      }
      tank.pendingWait = null;
      if (instruction.children.length) {
        tank.executionStack.push({ instructions: instruction.children, index: 0 });
      }
      tank.cooldown = codeStepDelay;
      highlightInstruction(tank, instruction, 'condition is true — continuing');
      return;
    }

    for (let controlSteps = 0; controlSteps < 24; controlSteps += 1) {
      const frame = tank.executionStack[tank.executionStack.length - 1];
      if (!frame) {
        tank.programDone = true;
        return;
      }

      if (frame.index >= frame.instructions.length) {
        if (frame.repeatRemaining > 1) {
          frame.repeatRemaining -= 1;
          frame.index = 0;
          tank.cooldown = codeStepDelay;
          return;
        }
        if (frame.untilExpression) {
          if (!spendActions(tank, frame.untilInstruction)) return;
          if (evaluate(frame.untilExpression, tank, enemy)) {
            tank.executionStack.pop();
            tank.cooldown = codeStepDelay;
            return;
          }
          frame.index = 0;
          tank.cooldown = codeStepDelay;
          return;
        }
        tank.executionStack.pop();
        tank.cooldown = codeStepDelay;
        if (!tank.executionStack.length) {
          tank.programDone = true;
          return;
        }
        return;
      }

      const instruction = frame.instructions[frame.index++];
      if (!spendActions(tank, instruction)) return;
      tank.lastInstruction = instruction;
      highlightInstruction(tank, instruction, `checking ${instructionLabel(instruction)}`);

      if (instruction.name === 'start') {
        highlightInstruction(tank, instruction, 'program started');
        tank.cooldown = codeStepDelay;
        return;
      }
      if (instruction.name === 'if') {
        if (evaluate(instruction.expression, tank, enemy) && instruction.children.length) {
          tank.executionStack.push({ instructions: instruction.children, index: 0 });
        }
        tank.cooldown = codeStepDelay;
        return;
      }
      if (instruction.name === 'repeat') {
        const count = Math.max(0, Number(instruction.input) || 0);
        if (count > 0 && instruction.children.length) {
          tank.executionStack.push({
            instructions: instruction.children,
            index: 0,
            repeatRemaining: count,
          });
        }
        tank.cooldown = codeStepDelay;
        return;
      }
      if (instruction.name === 'wait until') {
        if (evaluate(instruction.expression, tank, enemy)) {
          if (instruction.children.length) {
            tank.executionStack.push({ instructions: instruction.children, index: 0 });
          }
          tank.cooldown = codeStepDelay;
        } else {
          tank.pendingWait = { instruction };
          tank.cooldown = codeStepDelay;
          highlightInstruction(tank, instruction, 'waiting for condition to become true');
          return;
        }
        return;
      }
      if (instruction.name === 'repeat until') {
        if (!evaluate(instruction.expression, tank, enemy)) {
          tank.executionStack.push({
            instructions: instruction.children,
            index: 0,
            untilExpression: instruction.expression,
            untilInstruction: instruction,
          });
        }
        tank.cooldown = codeStepDelay;
        return;
      }

      const next = (distance) => ({
        x: tank.x + Math.cos(tank.angle) * distance,
        y: tank.y + Math.sin(tank.angle) * distance,
      });
      switch (instruction.name) {
        case 'move':
          tank.current = { kind: 'move', remaining: 40 };
          highlightInstruction(tank, instruction, 'moving forward one space');
          return;
        case 'rotate': {
          const value = instruction.direction === 'right' ? -Math.PI / 2
            : instruction.direction === '180' ? Math.PI : Math.PI / 2;
          tank.angle += value;
          highlightInstruction(tank, instruction, `rotated to ${instructionLabel(instruction).replace('rotate ', '')}`);
          tank.cooldown = codeStepDelay;
          return;
        }
        case 'fire':
          if (tank.ammo > 0) {
            tank.ammo -= 1;
            bullets.push({ x: tank.x, y: tank.y, angle: tank.angle, owner: tank, speed: 280, life: 1.8 });
            highlightInstruction(tank, instruction, 'fired one shot');
          } else {
            highlightInstruction(tank, instruction, 'cannot fire — out of ammo');
          }
          tank.cooldown = codeStepDelay;
          return;
        case 'shield':
          tank.shield = 1;
          highlightInstruction(tank, instruction, 'shield ready to block one hit');
          tank.cooldown = codeStepDelay;
          return;
        case 'jump': {
          const landing = next(80);
          const boundedLanding = {
            x: Math.min(canvasWidth - 36, Math.max(36, landing.x)),
            y: Math.min(canvasHeight - 36, Math.max(36, landing.y)),
          };
          if (!collidesWithObstacle(boundedLanding.x, boundedLanding.y)) {
            tank.x = boundedLanding.x;
            tank.y = boundedLanding.y;
          }
          highlightInstruction(tank, instruction, 'jumped two spaces over obstacles');
          tank.cooldown = codeStepDelay;
          return;
        }
        case 'self-destruct': {
          const nearbyEnemy = Math.hypot(enemy.x - tank.x, enemy.y - tank.y) <= 80;
          if (nearbyEnemy) {
            enemy.damageReceived += enemy.health;
            enemy.health = 0;
          }
          tank.health = 0;
          highlightInstruction(tank, instruction, nearbyEnemy
            ? 'self-destructed — both tanks are destroyed'
            : 'self-destructed — explosion missed the enemy');
          return;
        }
        case 'reload':
          tank.ammo = 3;
          highlightInstruction(tank, instruction, 'reloaded to maximum ammo');
          tank.cooldown = codeStepDelay;
          return;
        case 'place mine':
          mines.push({ x: tank.x, y: tank.y, owner: tank, life: 8, damage: 3 });
          highlightInstruction(tank, instruction, 'placed a mine (3 damage)');
          tank.cooldown = codeStepDelay;
          return;
        case 'wait':
          tank.cooldown = Math.max(0, Number(instruction.input) || 1) * codeStepDelay;
          highlightInstruction(tank, instruction, `waiting ${instruction.input || 1} action${Number(instruction.input || 1) === 1 ? '' : 's'}`);
          return;
        default:
          tank.cooldown = codeStepDelay;
          return;
      }
    }
    tank.cooldown = codeStepDelay;
  };

  const drawArena = () => {
    const ctx = gameContext;
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    ctx.fillStyle = '#172338';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    ctx.strokeStyle = '#ffffff10';
    ctx.lineWidth = 1;
    for (let x = 20; x < canvasWidth; x += 40) {
      for (let y = 20; y < canvasHeight; y += 40) {
        ctx.beginPath(); ctx.arc(x, y, 1.5, 0, Math.PI * 2); ctx.stroke();
      }
    }
    ctx.fillStyle = '#40516a';
    obstacles.forEach(({ x, y, width, height }) => {
      ctx.fillRect(x - width / 2, y - height / 2, width, height);
      ctx.strokeStyle = '#9aacc455';
      ctx.strokeRect(x - width / 2, y - height / 2, width, height);
    });

    mines.forEach((mine) => {
      ctx.fillStyle = '#f6c453'; ctx.beginPath(); ctx.arc(mine.x, mine.y, 8, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff3c4'; ctx.stroke();
    });
    bullets.forEach((bullet) => {
      ctx.fillStyle = '#fff2a1'; ctx.beginPath(); ctx.arc(bullet.x, bullet.y, 5, 0, Math.PI * 2); ctx.fill();
    });
    tanks.forEach((tank) => {
      ctx.save(); ctx.translate(tank.x, tank.y); ctx.rotate(tank.angle);
      ctx.fillStyle = tank.color; ctx.strokeStyle = '#08111c'; ctx.lineWidth = 3;
      ctx.fillRect(-21, -17, 42, 34); ctx.strokeRect(-21, -17, 42, 34);
      ctx.fillStyle = '#263448'; ctx.fillRect(-12, -22, 24, 44);
      ctx.fillStyle = tank.color; ctx.fillRect(0, -5, 33, 10);
      ctx.fillStyle = '#edf7ff'; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
      if (tank.shield > 0) { ctx.strokeStyle = '#66ddff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI * 2); ctx.stroke(); }
      ctx.restore();
      ctx.fillStyle = '#080d16'; ctx.fillRect(tank.x - 25, tank.y - 34, 50, 6);
      ctx.fillStyle = tank.color; ctx.fillRect(tank.x - 25, tank.y - 34, 50 * Math.max(0, tank.health) / 3, 6);
      ctx.fillStyle = '#e8edf7'; ctx.font = '12px system-ui'; ctx.textAlign = 'center';
      ctx.fillText(tank.isBot ? 'CPU' : `P${tank.player + 1}`, tank.x, tank.y + 38);
    });
    drawMinimap();
  };

  const drawMinimap = () => {
    if (!minimapContext || !minimapCanvas) return;
    const ctx = minimapContext;
    const width = minimapCanvas.width;
    const height = minimapCanvas.height;
    const scaleX = width / canvasWidth;
    const scaleY = height / canvasHeight;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#172338';
    ctx.fillRect(0, 0, width, height);
    ctx.save();
    ctx.scale(scaleX, scaleY);
    ctx.strokeStyle = '#ffffff18';
    ctx.lineWidth = 1 / scaleX;
    for (let x = 20; x < canvasWidth; x += 40) {
      for (let y = 20; y < canvasHeight; y += 40) {
        ctx.beginPath();
        ctx.arc(x, y, 1.5, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    obstacles.forEach(({ x, y, width: obstacleWidth, height: obstacleHeight }) => {
      ctx.fillStyle = '#40516a';
      ctx.fillRect(x - obstacleWidth / 2, y - obstacleHeight / 2, obstacleWidth, obstacleHeight);
      ctx.strokeStyle = '#9aacc488';
      ctx.strokeRect(x - obstacleWidth / 2, y - obstacleHeight / 2, obstacleWidth, obstacleHeight);
    });
    const previewTanks = tanks.length ? tanks : [
      { player: 0, x: 150, y: canvasHeight / 2, angle: 0, color: '#4ad5f2', isBot: false },
      { player: 1, x: canvasWidth - 150, y: canvasHeight / 2, angle: Math.PI, color: '#ff766f', isBot: mode === 'solo' },
    ];
    previewTanks.forEach((tank) => {
      ctx.save();
      ctx.translate(tank.x, tank.y);
      ctx.rotate(tank.angle);
      ctx.fillStyle = tank.color;
      ctx.fillRect(-21, -17, 42, 34);
      ctx.fillStyle = '#edf7ff';
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = tank.color;
      ctx.fillRect(2, -4, 29, 8);
      ctx.restore();
    });
    bullets.forEach((bullet) => {
      ctx.fillStyle = '#fff2a1';
      ctx.beginPath();
      ctx.arc(bullet.x, bullet.y, 5, 0, Math.PI * 2);
      ctx.fill();
    });
    mines.forEach((mine) => {
      ctx.fillStyle = '#f6c453';
      ctx.beginPath();
      ctx.arc(mine.x, mine.y, 8, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
    ctx.strokeStyle = '#ffffff35';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, width - 1, height - 1);
  };

  const tick = (timestamp) => {
    if (!isRunning) return;
    const delta = Math.min(0.05, (timestamp - lastFrameTime) / 1000 || 0);
    lastFrameTime = timestamp;
    if ((timestamp - roundStartedAt) / 1000 >= roundDuration) {
      const winner = tanks[0].health > tanks[1].health ? 0
        : tanks[1].health > tanks[0].health ? 1 : null;
      finishRound(winner);
      return;
    }
    tanks.forEach((tank) => {
      tank.cooldown = Math.max(0, tank.cooldown - delta);
      if (!tank.current) nextInstruction(tank);
      if (tank.current?.kind === 'move') {
        const distance = Math.min(tank.current.remaining, 90 * delta);
        const nextX = tank.x + Math.cos(tank.angle) * distance;
        const nextY = tank.y + Math.sin(tank.angle) * distance;
        if (collidesWithObstacle(nextX, nextY)) {
          tank.current = null;
          tank.cooldown = 0.2;
          highlightInstruction(tank, tank.lastInstruction || { name: 'move' }, 'blocked by an obstacle');
        } else {
          tank.x = nextX;
          tank.y = nextY;
          tank.current.remaining -= distance;
          if (tank.current.remaining <= 0) {
            tank.current = null;
            tank.cooldown = codeStepDelay;
          }
          keepInArena(tank);
        }
      }
    });
    bullets = bullets.filter((bullet) => {
      bullet.x += Math.cos(bullet.angle) * bullet.speed * delta;
      bullet.y += Math.sin(bullet.angle) * bullet.speed * delta;
      bullet.life -= delta;
      const target = tanks.find((tank) => tank !== bullet.owner);
      if (obstacles.some((obstacle) => (
        Math.abs(bullet.x - obstacle.x) <= obstacle.width / 2
          && Math.abs(bullet.y - obstacle.y) <= obstacle.height / 2
      ))) return false;
      if (target && Math.hypot(target.x - bullet.x, target.y - bullet.y) < 24) {
        if (target.shield <= 0) {
          target.health -= 1;
          target.damageReceived += 1;
          target.flash = 0.2;
        } else {
          target.shield = 0;
          const arenaStatus = document.querySelector('.arena-status');
          if (arenaStatus) arenaStatus.textContent = `Player ${target.player + 1}'s shield blocked a shot.`;
        }
        return false;
      }
      return bullet.life > 0 && bullet.x > 0 && bullet.x < canvasWidth && bullet.y > 0 && bullet.y < canvasHeight;
    });
    mines = mines.filter((mine) => {
      mine.life -= delta;
      const target = tanks.find((tank) => tank !== mine.owner);
      if (target && Math.hypot(target.x - mine.x, target.y - mine.y) < 25) {
        if (target.shield <= 0) {
          const damage = mine.damage || 3;
          target.health -= damage;
          target.damageReceived += damage;
        } else {
          target.shield = 0;
          const arenaStatus = document.querySelector('.arena-status');
          if (arenaStatus) arenaStatus.textContent = `Player ${target.player + 1}'s shield blocked the mine.`;
        }
        return false;
      }
      return mine.life > 0;
    });
    updateHealth();
    drawArena();
    if (tanks.some((tank) => tank.health <= 0)) {
      const winner = tanks[0].health <= 0 ? (tanks[1].health <= 0 ? null : 1) : 0;
      finishRound(winner);
      return;
    }
    if (tanks.every((tank) => tank.programDone && !tank.current && tank.cooldown <= 0)
      && bullets.length === 0) {
      const winner = tanks[0].health > tanks[1].health ? 0
        : tanks[1].health > tanks[0].health ? 1 : null;
      finishRound(winner);
      return;
    }
    animationFrame = requestAnimationFrame(tick);
  };

  const startRound = () => {
    cancelAnimationFrame(animationFrame);
    bullets = [];
    mines = [];
    roundOver = false;
    matchOver = false;
    const playerProgram = programs[0] || document.createElement('div');
    const compiledPlayer = compileProgram(playerProgram);
    if (!compiledPlayer.length) {
      setStatus('Add a start block to Player 1’s program before playing.');
      return;
    }
    const compiledOpponent = mode === 'solo'
      ? randomBotProgram()
      : compileProgram(programs[1] || document.createElement('div'));
    if (!compiledOpponent.length) {
      setStatus('Add a start block to Player 2’s program before playing.');
      return;
    }
    drawProgramPanel(0, compiledPlayer);
    drawProgramPanel(1, compiledOpponent);
    tanks = [
      createTank(0, compiledPlayer, false, activeRound === 1 ? 3 : healthBetweenRounds[0], currentBudget()),
      createTank(1, compiledOpponent, mode === 'solo', activeRound === 1 ? 3 : healthBetweenRounds[1], currentBudget()),
    ];
    document.querySelector('.opponent-name').textContent = mode === 'solo' ? 'CPU' : 'PLAYER 2';
    document.querySelector('.arena-round-number').textContent = String(activeRound);
    arenaRoundLabel.textContent = String(activeRound);
    nextRoundButton.hidden = true;
    backToCodeButton.hidden = true;
    gameSetup.hidden = true;
    arenaScreen.hidden = false;
    gameWorkspace.classList.remove('is-planning');
    isRunning = true;
    lastFrameTime = performance.now();
    roundStartedAt = lastFrameTime;
    setStatus('Tanks deployed — executing programs!');
    drawArena();
    animationFrame = requestAnimationFrame(tick);
  };

  playButton?.addEventListener('click', () => {
    saveCurrentProgram();
    if (!programs[0] || (mode === 'duel' && !programs[1])) {
      setStatus('Build and save a program for each player first.');
      updatePlayerTabs();
      return;
    }
    const invalidPlayer = programs.findIndex((program) => program && programCost(program) > currentBudget());
    if (invalidPlayer !== -1) {
      currentPlayer = invalidPlayer;
      restoreCurrentProgram();
      setStatus(`Player ${invalidPlayer + 1} is over the ${currentBudget()} action limit.`);
      return;
    }
    const missingStart = programs.findIndex((program) => program && !compileProgram(program).length);
    if (missingStart !== -1) {
      currentPlayer = missingStart;
      restoreCurrentProgram();
      setStatus(`Add a start block to Player ${missingStart + 1}’s program before playing.`);
      return;
    }
    startRound();
  });

  nextRoundButton?.addEventListener('click', () => {
    if (matchOver) return;
    activeRound += 1;
    programs = [null, null];
    currentPlayer = 0;
    clearProgramPanels();
    updatePlayerTabs();
    gameSetup.hidden = true;
    arenaScreen.hidden = true;
    gameWorkspace.classList.add('is-planning');
    restoreCurrentProgram();
    roundNumberLabel.textContent = String(activeRound);
    setStatus(`Round ${activeRound}: action budget increased to ${currentBudget()}. Update your program.`);
    nextRoundButton.hidden = true;
  });

  backToCodeButton?.addEventListener('click', () => {
    cancelAnimationFrame(animationFrame);
    isRunning = false;
    arenaScreen.hidden = true;
    gameWorkspace.classList.add('is-planning');
    currentPlayer = 0;
    restoreCurrentProgram();
    setStatus(matchOver ? 'Match complete. You can edit and test again.' : 'Edit your program for the next round.');
    backToCodeButton.hidden = true;
  });

  document.querySelector('.workspace-canvas')?.addEventListener('drop', () => {
    window.setTimeout(updatePlayerTabs, 0);
    window.setTimeout(drawMinimap, 0);
  });
  updatePlayerTabs();
  drawArena();
}
