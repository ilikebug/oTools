function getSavedWindowPosition(store) {
  const pos = store.get('windowPosition');
  if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
    return pos;
  }
  return null;
}

function saveWindowPosition(store, x, y) {
  store.set('windowPosition', { x, y });
}

module.exports = { getSavedWindowPosition, saveWindowPosition }; 