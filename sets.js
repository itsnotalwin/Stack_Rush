'use strict';
/*
 * Colour sets and the rules that unlock them. Loaded before game.js: nothing here runs until the game calls it.
 * The shiny sets (bronze, silver, gold) are a deliberate exception to the flat look, and only appear when you pick them.
 */
const UNLOCK_ALL = false;     // set to true to open every colour set from the start

const SETS = [
  { id: 'auto',    name: 'Auto',       tint: '#E9ECF0', p: null, preview: ['#2F6F6A', '#E8643C', '#5B3A8C', '#4FB3A9'], how: 'Follows the sky' },
  { id: 'classic', name: 'Classic',    tint: '#F4EFE6', p: ['#2F6F6A', '#D9A441', '#E8643C', '#6B5B95'] },
  { id: 'morning', name: 'Morning',    tint: '#CFE2F3', p: ['#2A6F97', '#E0A030', '#D95D39', '#6F58A8'], need: { level: 3 } },
  { id: 'sunset',  name: 'Sunset',     tint: '#F0A99F', p: ['#4A3A8A', '#1F7A70', '#A8323E', '#3B4B9B'], need: { level: 6 } },
  { id: 'night',   name: 'Night',      tint: '#1B2142', p: ['#4FB3A9', '#F2C14E', '#FF7A59', '#9B8CFF'], need: { level: 12 } },
  { id: 'deep',    name: 'Deep night', tint: '#120F2B', p: ['#6FE0D0', '#FFD166', '#FF6F91', '#B49CFF'], need: { level: 16 } },
  { id: 'bronze',  name: 'Bronze',     tint: '#F2E1D0', p: ['#CD8B54', '#B8733F', '#D99A68', '#A8622F'], shine: true, need: { medals: 15 } },
  { id: 'silver',  name: 'Silver',     tint: '#E4E8EF', p: ['#C9CED8', '#AEB5C2', '#DADFE8', '#9AA2B1'], shine: true, need: { medals: 40 } },
  { id: 'gold',    name: 'Shiny gold', tint: '#FBF1CF', p: ['#F2C230', '#E5A91A', '#F7D460', '#D9961A'], shine: true, need: { golds: 10 } }
];

const goldCount = () => Object.values(save.medals).filter(m => m === 3).length;   // levels where you earned all three medals
function setUnlocked(s) {
  if (UNLOCK_ALL || !s.need) return true;
  const n = s.need;
  return save.level >= (n.level || 0) && medalTotal() >= (n.medals || 0) && goldCount() >= (n.golds || 0);
}
const unlockedIds = () => SETS.filter(setUnlocked).map(s => s.id);
function setHow(s) {                                  // the line under a set's name
  if (setUnlocked(s)) return s.how || 'Unlocked';
  const n = s.need;
  return n.level ? `Reach level ${n.level}` : n.medals ? `Collect ${n.medals} medals` : `Get 3 medals on ${n.golds} levels`;
}
function activeSet() {                                // the chosen set, or Auto if it is missing or still locked
  const s = SETS.find(x => x.id === save.set);
  return s && setUnlocked(s) ? s : SETS[0];
}
