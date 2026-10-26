const palette = document.querySelector('.blocksCont');
const workspace = document.querySelector('.blockMatt');

document.addEventListener('input', (event) => {
  if (event.target.matches('.block input')) {
    event.target.value = event.target.value.replace(/\D/g, '');
  }
});

if (palette && workspace) {
  let draggedBlock = null;
  let draggedGroup = [];
  let newBlock = true;
  let snapTarget = null;
  const blockHeights = new WeakMap();

  const findSnapTarget = (clientX, clientY) => {
    let closest = null;
    let closestDistance = Infinity;

    workspace.querySelectorAll(':scope > .block').forEach((block) => {
      if (draggedGroup.includes(block)) return;
      const rect = block.getBoundingClientRect();
      const horizontalDistance = Math.max(rect.left - clientX, 0, clientX - rect.right);
      const verticalDistance = Math.max(rect.top - clientY, 0, clientY - rect.bottom);
      const distance = Math.hypot(horizontalDistance, verticalDistance);

      if (distance < closestDistance) {
        closest = block;
        closestDistance = distance;
      }
    });

    return closestDistance <= 100 ? closest : null;
  };

  const findExpressionInput = (clientX, clientY) => {
    const isOperator = draggedBlock?.classList.contains('operator');
    const containsPoint = (input) => {
      const rect = input.getBoundingClientRect();
      return clientX >= rect.left && clientX <= rect.right
        && clientY >= rect.top && clientY <= rect.bottom;
    };

    if (isOperator) {
      return Array.from(workspace.querySelectorAll('.expression-input')).find(containsPoint) || null;
    }

    const operandInput = Array.from(workspace.querySelectorAll('.operand-input')).find(containsPoint);
    if (operandInput) return operandInput;

    return Array.from(workspace.querySelectorAll('.expression-input')).find((input) => (
      !input.querySelector('.operator') && containsPoint(input)
    )) || null;
  };

  const findWrapDropTarget = (clientX, clientY) => {
    return Array.from(workspace.querySelectorAll('.wrap-contents')).find((container) => {
      if (draggedBlock?.contains(container)) return false;
      const rect = container.getBoundingClientRect();
      return clientX >= rect.left && clientX <= rect.right
        && clientY >= rect.top && clientY <= rect.bottom;
    }) || null;
  };

  const findRemoveTarget = (clientX, clientY) => {
    const removeTarget = workspace.querySelector('.remove');
    if (!removeTarget) return null;
    const rect = removeTarget.getBoundingClientRect();
    return clientX >= rect.left && clientX <= rect.right
      && clientY >= rect.top && clientY <= rect.bottom
      ? removeTarget
      : null;
  };

  const updateSnapTarget = (target) => {
    if (snapTarget) snapTarget.classList.remove('snap-target');
    snapTarget = target;
    if (snapTarget) snapTarget.classList.add('snap-target');
  };

  const updateStackingOrder = () => {
    const columns = new Map();
    workspace.querySelectorAll(':scope > .block').forEach((block) => {
      const column = columns.get(block.offsetLeft) || [];
      column.push(block);
      columns.set(block.offsetLeft, column);
    });

    columns.forEach((column) => {
      column.sort((first, second) => first.offsetTop - second.offsetTop);
      column.forEach((block, index) => {
        block.style.zIndex = String(index + 1);
      });
    });
  };

  const observeBlockHeight = (block) => {
    blockHeights.set(block, block.offsetHeight);
    blockResizeObserver.observe(block);
  };

  const blockResizeObserver = new ResizeObserver((entries) => {
    entries.forEach(({ target }) => {
      const previousHeight = blockHeights.get(target);
      const currentHeight = target.offsetHeight;
      if (previousHeight === undefined || previousHeight === currentHeight) return;

      const heightChange = currentHeight - previousHeight;
      if (target.parentElement === workspace) {
        const nextBlocks = Array.from(workspace.querySelectorAll(':scope > .block'))
          .filter((block) => block !== target && block.offsetLeft === target.offsetLeft
            && block.offsetTop >= target.offsetTop + previousHeight - 2)
          .sort((first, second) => first.offsetTop - second.offsetTop);

        nextBlocks.forEach((block) => {
          block.style.top = `${Math.max(0, block.offsetTop + heightChange)}px`;
        });
      }
      blockHeights.set(target, currentHeight);
    });
  });

  const workspaceBlockObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        if (node.matches('.block')) observeBlockHeight(node);
        node.querySelectorAll('.block').forEach(observeBlockHeight);
      });
    });
  });
  workspaceBlockObserver.observe(workspace, { childList: true, subtree: true });
  workspace.querySelectorAll('.block').forEach(observeBlockHeight);

  palette.addEventListener('dragstart', (event) => {
    const block = event.target.closest('.block');
    if (!block) return;
    draggedBlock = block;
    newBlock = true;
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData('text/plain', block.textContent.trim());
  });
  workspace.addEventListener('dragstart', (event) => {
    const block = event.target.closest('.block');
    if (!block) return;
    draggedBlock = block;
    newBlock = false;
    if (block.classList.contains('variable')) {
      draggedGroup = [block];
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', block.textContent.trim());
      return;
    }
    draggedGroup = [block];

    const sameColumn = Array.from(workspace.querySelectorAll(':scope > .block'))
      .filter((candidate) => candidate.offsetLeft === block.offsetLeft)
      .sort((first, second) => first.offsetTop - second.offsetTop);
    const blockIndex = sameColumn.indexOf(block);
    let previousBlock = block;

    for (let index = blockIndex + 1; index < sameColumn.length; index += 1) {
      const child = sameColumn[index];
      if (child.offsetTop > previousBlock.offsetTop + previousBlock.offsetHeight + 8) break;
      draggedGroup.push(child);
      previousBlock = child;
    }

    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', block.textContent.trim());
  });
  const clearDraggedBlock = () => {
    updateSnapTarget(null);
    draggedBlock = null;
    draggedGroup = [];
  };
  palette.addEventListener('dragend', clearDraggedBlock);
  workspace.addEventListener('dragend', clearDraggedBlock);
  workspace.addEventListener('dragover', (event) => {
    event.preventDefault();
    const removeTarget = findRemoveTarget(event.clientX, event.clientY);
    if (removeTarget) {
      event.dataTransfer.dropEffect = newBlock ? 'none' : 'move';
      updateSnapTarget(newBlock ? null : removeTarget);
      return;
    }
    if (draggedBlock?.matches('.variable, .operator')) {
      const input = findExpressionInput(event.clientX, event.clientY);
      const wrapTarget = input ? null : findWrapDropTarget(event.clientX, event.clientY);
      const canDropOnWorkspace = draggedBlock.matches('.variable, .operator');
      event.dataTransfer.dropEffect = input || wrapTarget || !newBlock || canDropOnWorkspace
        ? (newBlock ? 'copy' : 'move')
        : 'none';
      updateSnapTarget(input || wrapTarget);
      return;
    }
    event.dataTransfer.dropEffect = newBlock ? 'copy' : 'move';
    updateSnapTarget(findWrapDropTarget(event.clientX, event.clientY)
      || findSnapTarget(event.clientX, event.clientY));
  });
  workspace.addEventListener('drop', (event) => {
    event.preventDefault();
    if (!draggedBlock) return;
    const removeTarget = findRemoveTarget(event.clientX, event.clientY);
    if (removeTarget) {
      updateSnapTarget(null);
      if (!newBlock) {
        const removedBlock = draggedBlock;
        const parent = removedBlock.parentElement;
        const oldTop = removedBlock.offsetTop;
        const oldLeft = removedBlock.offsetLeft;
        const oldHeight = removedBlock.offsetHeight;
        removedBlock.remove();

        if (parent === workspace) {
          workspace.querySelectorAll(':scope > .block').forEach((block) => {
            if (block.offsetLeft === oldLeft && block.offsetTop > oldTop) {
              block.style.top = `${Math.max(0, block.offsetTop - oldHeight)}px`;
            }
          });
        }
        updateStackingOrder();
      }
      draggedBlock = null;
      draggedGroup = [];
      return;
    }
    if (draggedBlock.matches('.variable, .operator')) {
      const input = findExpressionInput(event.clientX, event.clientY);
      const wrapTarget = input ? null : findWrapDropTarget(event.clientX, event.clientY);
      updateSnapTarget(null);
      const canDropOnWorkspace = draggedBlock.matches('.variable, .operator');
      if (!input && !wrapTarget && newBlock && !canDropOnWorkspace) return;

      const variableBlock = newBlock ? draggedBlock.cloneNode(true) : draggedBlock;
      variableBlock.draggable = true;
      if (input) {
        variableBlock.style.position = 'relative';
        variableBlock.style.left = '';
        variableBlock.style.top = '';
        input.replaceChildren(variableBlock);
      } else if (wrapTarget) {
        variableBlock.style.position = 'relative';
        variableBlock.style.left = '';
        variableBlock.style.top = '';
        wrapTarget.appendChild(variableBlock);
      } else {
        const bounds = workspace.getBoundingClientRect();
        variableBlock.style.position = 'absolute';
        variableBlock.style.left = `${Math.max(0, event.clientX - bounds.left + workspace.scrollLeft - variableBlock.offsetWidth / 2)}px`;
        variableBlock.style.top = `${Math.max(0, event.clientY - bounds.top + workspace.scrollTop - variableBlock.offsetHeight / 2)}px`;
        workspace.appendChild(variableBlock);
      }
      updateStackingOrder();
      draggedBlock = null;
      draggedGroup = [];
      return;
    }
    const wrapTarget = findWrapDropTarget(event.clientX, event.clientY);
    if (wrapTarget) {
      updateSnapTarget(null);
      const nestedBlock = newBlock ? draggedBlock.cloneNode(true) : draggedBlock;
      nestedBlock.style.position = 'relative';
      nestedBlock.style.left = '';
      nestedBlock.style.top = '';
      nestedBlock.style.zIndex = '';
      nestedBlock.draggable = true;
      wrapTarget.appendChild(nestedBlock);
      updateStackingOrder();
      draggedBlock = null;
      draggedGroup = [];
      return;
    }
    const block = newBlock ? draggedBlock.cloneNode(true) : draggedBlock;
    const movingBlocks = newBlock ? [block] : draggedGroup;
    const originalLeft = draggedBlock.offsetLeft;
    const originalTop = draggedBlock.offsetTop;
    const bounds = workspace.getBoundingClientRect();
    let left = event.clientX - bounds.left + workspace.scrollLeft - block.offsetWidth / 2;
    let top = event.clientY - bounds.top + workspace.scrollTop - block.offsetHeight / 2;
    const nearestBlock = findSnapTarget(event.clientX, event.clientY);
    updateSnapTarget(null);

    if (nearestBlock) {
      const targetRect = nearestBlock.getBoundingClientRect();
      const placeAbove = event.clientY < targetRect.top + targetRect.height / 2;
      left = nearestBlock.offsetLeft;
      top = placeAbove
        ? nearestBlock.offsetTop - block.offsetHeight
        : nearestBlock.offsetTop + nearestBlock.offsetHeight;
    }

    left = Math.max(0, left);
    top = Math.max(0, top);
    const deltaLeft = left - originalLeft;
    const deltaTop = top - originalTop;
    movingBlocks.forEach((movingBlock) => {
      movingBlock.style.position = 'absolute';
      movingBlock.style.left = `${Math.max(0, movingBlock.offsetLeft + deltaLeft)}px`;
      movingBlock.style.top = `${Math.max(0, movingBlock.offsetTop + deltaTop)}px`;
      movingBlock.draggable = true;
    });
    block.style.left = `${left}px`;
    block.style.top = `${top}px`;
    if (newBlock) workspace.appendChild(block);

    if (nearestBlock) {
      const column = Array.from(workspace.querySelectorAll(':scope > .block'))
        .filter((columnBlock) => columnBlock.offsetLeft === left)
        .filter((columnBlock) => !movingBlocks.includes(columnBlock))
        .sort((first, second) => first.offsetTop - second.offsetTop);
      const targetIndex = column.indexOf(nearestBlock);
      const targetRect = nearestBlock.getBoundingClientRect();
      const placeAbove = event.clientY < targetRect.top + targetRect.height / 2;
      const insertIndex = targetIndex + (placeAbove ? 0 : 1);
      column.splice(insertIndex, 0, ...movingBlocks);

      let nextTop = top;
      for (let index = insertIndex; index < column.length; index += 1) {
        const currentBlock = column[index];
        if (movingBlocks.includes(currentBlock)) {
          currentBlock.style.left = `${left}px`;
          currentBlock.style.top = `${nextTop}px`;
        } else if (currentBlock.offsetTop < nextTop) {
          currentBlock.style.top = `${nextTop}px`;
        }
        nextTop = currentBlock.offsetTop + currentBlock.offsetHeight;
      }
    }

    updateStackingOrder();
    draggedBlock = null;
    draggedGroup = [];
  });
  palette.querySelectorAll('.block').forEach((block) => {
    block.draggable = true;
  });
}
