const palette = document.querySelector('.blocksCont');
const workspace = document.querySelector('.blockMatt');
const workspaceFrame = document.querySelector('.workspace-frame');
const workspaceCanvas = document.querySelector('.workspace-canvas');
const categoryNav = document.querySelector('.block-category-nav');

const setActiveCategory = (categoryId) => {
  if (!categoryNav) return;
  categoryNav.querySelectorAll('.category-nav-button').forEach((button) => {
    if (button.dataset.category === categoryId) {
      button.setAttribute('aria-current', 'true');
    } else {
      button.removeAttribute('aria-current');
    }
  });
};

const updateActiveCategoryFromScroll = () => {
  if (!palette || !categoryNav) return;
  const sections = Array.from(palette.querySelectorAll('.block-category'));
  if (!sections.length) return;

  const atBottom = palette.scrollTop + palette.clientHeight >= palette.scrollHeight - 2;
  const paletteTop = palette.getBoundingClientRect().top;
  let activeSection = sections[0];

  if (atBottom) {
    activeSection = sections[sections.length - 1];
  } else {
    sections.forEach((section) => {
      if (section.getBoundingClientRect().top <= paletteTop + 40) activeSection = section;
    });
  }

  setActiveCategory(activeSection.id.replace(/^blocks-/, ''));
};

categoryNav?.addEventListener('click', (event) => {
  const button = event.target.closest('.category-nav-button');
  if (!button) return;
  const category = document.getElementById(`blocks-${button.dataset.category}`);
  if (!category || !palette) return;

  category.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
  setActiveCategory(button.dataset.category);
});

palette?.addEventListener('scroll', updateActiveCategoryFromScroll, { passive: true });
window.addEventListener('resize', updateActiveCategoryFromScroll);
updateActiveCategoryFromScroll();

document.addEventListener('input', (event) => {
  if (event.target.matches('.block input')) {
    event.target.value = event.target.value.replace(/\D/g, '');
  }
});

if (palette && workspace && workspaceFrame && workspaceCanvas) {
  let draggedBlock = null;
  let draggedGroup = [];
  let newBlock = true;
  let snapTarget = null;
  let zoomScale = 1;
  const actionsCounter = workspaceFrame.querySelector('.actions-counter');
  const actionsUsed = actionsCounter?.querySelector('.actions-used');
  const actionLimit = Number(workspaceFrame.dataset.actionLimit) || 10;
  const blockHeights = new WeakMap();
  const zoomLevel = workspaceFrame.querySelector('.zoom-level');

  const updateZoom = (nextScale) => {
    const centerX = (workspace.scrollLeft + workspace.clientWidth / 2) / zoomScale;
    const centerY = (workspace.scrollTop + workspace.clientHeight / 2) / zoomScale;
    zoomScale = Math.min(2, Math.max(0.5, Math.round(nextScale * 10) / 10));
    workspaceCanvas.style.transform = `scale(${zoomScale})`;
    workspaceCanvas.style.width = `${100 / zoomScale}%`;
    workspaceCanvas.style.height = `${100 / zoomScale}%`;
    if (zoomLevel) zoomLevel.textContent = `${Math.round(zoomScale * 100)}%`;
    workspace.scrollLeft = Math.max(0, centerX * zoomScale - workspace.clientWidth / 2);
    workspace.scrollTop = Math.max(0, centerY * zoomScale - workspace.clientHeight / 2);
  };

  workspaceFrame.querySelector('.zoom-in')?.addEventListener('click', () => {
    updateZoom(zoomScale + 0.1);
  });
  workspaceFrame.querySelector('.zoom-out')?.addEventListener('click', () => {
    updateZoom(zoomScale - 0.1);
  });

  const updateActionsCounter = () => {
    if (!actionsCounter || !actionsUsed) return;
    const total = Array.from(workspace.querySelectorAll('.block')).reduce((sum, block) => {
      const ticks = block.querySelector(':scope > .block-header > .ticks');
      return sum + (ticks?.childElementCount || 0);
    }, 0);
    actionsUsed.textContent = String(total);
    actionsCounter.classList.toggle('over-limit', total > actionLimit);
    actionsCounter.setAttribute('aria-label', `Actions used: ${total} of ${actionLimit}`);
  };

  const findSnapTarget = (clientX, clientY) => {
    let closest = null;
    let closestDistance = Infinity;

    workspaceCanvas.querySelectorAll(':scope > .block').forEach((block) => {
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
    const findDeepestInput = (selector) => Array.from(workspace.querySelectorAll(selector))
      .filter(containsPoint)
      .sort((first, second) => {
        const depth = (element) => {
          let current = element;
          let count = 0;
          while (current && current !== workspace) {
            count += 1;
            current = current.parentElement;
          }
          return count;
        };
        const depthDifference = depth(second) - depth(first);
        if (depthDifference !== 0) return depthDifference;
        const firstRect = first.getBoundingClientRect();
        const secondRect = second.getBoundingClientRect();
        return (firstRect.width * firstRect.height) - (secondRect.width * secondRect.height);
      })[0] || null;

    if (isOperator) {
      return findDeepestInput('.expression-input, .operand-input');
    }

    const operandInput = findDeepestInput('.operand-input');
    if (operandInput) return operandInput;

    return findDeepestInput('.expression-input:not(:has(.operator))');
  };

  const findWrapDropTarget = (clientX, clientY) => {
    return Array.from(workspace.querySelectorAll('.wrap-contents'))
      .filter((container) => {
        if (draggedBlock?.contains(container)) return false;
        const rect = container.getBoundingClientRect();
        return clientX >= rect.left && clientX <= rect.right
          && clientY >= rect.top && clientY <= rect.bottom;
      })
      .sort((first, second) => {
        const depth = (element) => {
          let current = element;
          let count = 0;
          while (current && current !== workspace) {
            count += 1;
            current = current.parentElement;
          }
          return count;
        };
        return depth(second) - depth(first);
      })[0] || null;
  };

  const findRemoveTarget = (clientX, clientY) => {
    const removeTarget = workspaceFrame.querySelector('.remove');
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
    workspaceCanvas.querySelectorAll(':scope > .block').forEach((block) => {
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
      if (target.parentElement === workspaceCanvas) {
        const nextBlocks = Array.from(workspaceCanvas.querySelectorAll(':scope > .block'))
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
  workspaceBlockObserver.observe(workspaceCanvas, { childList: true, subtree: true });
  workspaceCanvas.querySelectorAll('.block').forEach(observeBlockHeight);

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
    if (block.parentElement !== workspaceCanvas) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', block.textContent.trim());
      return;
    }

    const sameColumn = Array.from(workspaceCanvas.querySelectorAll(':scope > .block'))
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
  workspaceFrame.addEventListener('dragover', (event) => {
    event.preventDefault();
    if (newBlock && draggedBlock?.classList.contains('start')
      && workspaceCanvas.querySelector('.block.start')) {
      event.dataTransfer.dropEffect = 'none';
      updateSnapTarget(null);
      return;
    }
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
  workspaceFrame.addEventListener('drop', (event) => {
    event.preventDefault();
    if (!draggedBlock) return;
    if (newBlock && draggedBlock.classList.contains('start')
      && workspaceCanvas.querySelector('.block.start')) return;
    const removeTarget = findRemoveTarget(event.clientX, event.clientY);
    if (removeTarget) {
      updateSnapTarget(null);
      if (!newBlock) {
        const removedBlocks = draggedGroup.length ? draggedGroup : [draggedBlock];
        const parent = removedBlocks[0].parentElement;
        const oldLeft = removedBlocks[0].offsetLeft;
        const oldTop = Math.min(...removedBlocks.map((block) => block.offsetTop));
        const oldBottom = Math.max(...removedBlocks.map((block) => (
          block.offsetTop + block.offsetHeight
        )));
        const removedHeight = oldBottom - oldTop;
        removedBlocks.forEach((block) => block.remove());

        if (parent === workspaceCanvas) {
          workspaceCanvas.querySelectorAll(':scope > .block').forEach((block) => {
            if (block.offsetLeft === oldLeft && block.offsetTop > oldTop) {
              block.style.top = `${Math.max(0, block.offsetTop - removedHeight)}px`;
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
        variableBlock.style.left = `${Math.max(0, (event.clientX - bounds.left + workspace.scrollLeft) / zoomScale - variableBlock.offsetWidth / 2)}px`;
        variableBlock.style.top = `${Math.max(0, (event.clientY - bounds.top + workspace.scrollTop) / zoomScale - variableBlock.offsetHeight / 2)}px`;
        workspaceCanvas.appendChild(variableBlock);
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
    const bounds = workspace.getBoundingClientRect();
    const isNestedBlock = !newBlock && draggedBlock.parentElement !== workspaceCanvas;
    const draggedRect = draggedBlock.getBoundingClientRect();
    const originalLeft = isNestedBlock
      ? (draggedRect.left - bounds.left + workspace.scrollLeft) / zoomScale
      : draggedBlock.offsetLeft;
    const originalTop = isNestedBlock
      ? (draggedRect.top - bounds.top + workspace.scrollTop) / zoomScale
      : draggedBlock.offsetTop;
    let left = (event.clientX - bounds.left + workspace.scrollLeft) / zoomScale
      - block.offsetWidth / 2;
    let top = (event.clientY - bounds.top + workspace.scrollTop) / zoomScale
      - block.offsetHeight / 2;
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
      if (isNestedBlock) {
        const rect = movingBlock.getBoundingClientRect();
        const currentLeft = (rect.left - bounds.left + workspace.scrollLeft) / zoomScale;
        const currentTop = (rect.top - bounds.top + workspace.scrollTop) / zoomScale;
        workspaceCanvas.appendChild(movingBlock);
        movingBlock.style.position = 'absolute';
        movingBlock.style.left = `${Math.max(0, currentLeft + deltaLeft)}px`;
        movingBlock.style.top = `${Math.max(0, currentTop + deltaTop)}px`;
        movingBlock.draggable = true;
        return;
      }
      movingBlock.style.position = 'absolute';
      movingBlock.style.left = `${Math.max(0, movingBlock.offsetLeft + deltaLeft)}px`;
      movingBlock.style.top = `${Math.max(0, movingBlock.offsetTop + deltaTop)}px`;
      movingBlock.draggable = true;
    });
    block.style.left = `${left}px`;
    block.style.top = `${top}px`;
    if (newBlock) workspaceCanvas.appendChild(block);

    if (nearestBlock) {
      const column = Array.from(workspaceCanvas.querySelectorAll(':scope > .block'))
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
  // Recount once the existing drop handler has finished adding, moving, or removing blocks.
  workspaceFrame.addEventListener('drop', updateActionsCounter);
  updateActionsCounter();
  palette.querySelectorAll('.block').forEach((block) => {
    block.draggable = true;
  });
}
