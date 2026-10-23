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
    event.dataTransfer.dropEffect = newBlock ? 'copy' : 'move';
    updateSnapTarget(findSnapTarget(event.clientX, event.clientY));
  });
  workspace.addEventListener('drop', (event) => {
    event.preventDefault();
    if (!draggedBlock) return;
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
