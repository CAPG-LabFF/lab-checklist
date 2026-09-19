// ---------------------------------------------------------------------------
// checklists.ts — SEED ONLY. No longer authoritative at runtime.
//
// The live checklists now come from the Google Sheet `Checklists` tab, published
// daily as a snapshot the app fetches via route=config. Editing THIS file does
// NOT change what the app shows — edit the Sheet instead (see HANDOVER.md).
//
// This file remains as: (1) the migration seed (scripts/seed-checklists.mjs turns
// it into the initial `Checklists` rows), (2) a code-reviewed record of the
// original content, and (3) the shared TS types + the fixed area list/names.
//
// Item `id`s are STABLE and NEVER reused — historical records reference them.
// ---------------------------------------------------------------------------

import type { Area, ActionType } from '../api/backend'

export type Item = { id: string; label: string }
export type Group = { title: string; items: Item[] }
export type Procedure = Group[]

/** Display order + names for the four cards. */
export const AREAS: { key: Area; name: string }[] = [
  { key: 'general', name: 'General' },
  { key: 'big_lab', name: 'Big Lab' },
  { key: 'small_lab_gc', name: 'Small Lab / GC Room' },
  { key: 'bromo_lab', name: 'Bromo Lab' },
]

export const AREA_NAME: Record<Area, string> = Object.fromEntries(
  AREAS.map((a) => [a.key, a.name]),
) as Record<Area, string>

// ---------------------------------------------------------------------------

export const CHECKLISTS: Record<Area, Record<ActionType, Procedure>> = {
  // ======================= GENERAL =======================
  general: {
    opening: [
      {
        title: 'N2 Generator Room',
        items: [
          { id: 'gen.open.n2.compressor', label: 'Turn ON the Air Compressor' },
          { id: 'gen.open.n2.fan', label: 'Turn ON the Ventilation Fan' },
          { id: 'gen.open.n2.cooler', label: 'Turn ON the Cooler' },
        ],
      },
      {
        title: 'Big Lab',
        items: [{ id: 'gen.open.biglab.gas', label: 'Open the Gas Valve taps' }],
      },
    ],
    closing: [
      {
        title: 'N2 Generator Room',
        items: [
          { id: 'gen.close.n2.compressor', label: 'Turn OFF the Air Compressor' },
          { id: 'gen.close.n2.fan', label: 'Turn OFF the Ventilation Fan' },
          { id: 'gen.close.n2.cooler', label: 'Turn OFF the Cooler' },
        ],
      },
      {
        title: 'Mass Room',
        items: [
          { id: 'gen.close.mass.lcms', label: 'Check LC-MS is 0.01 mL/min and UV is OFF' },
          { id: 'gen.close.mass.spectro', label: 'Check spectrophotometer and fluorimeter are OFF' },
          { id: 'gen.close.mass.ultrasounds', label: 'Check Ultrasounds is OFF' },
        ],
      },
      {
        title: 'Big Lab',
        items: [
          { id: 'gen.close.biglab.gas', label: 'Turn OFF the Gas Valve taps' },
          { id: 'gen.close.biglab.scales', label: 'Turn OFF the scales' },
        ],
      },
      {
        title: 'Cluster',
        items: [{ id: 'gen.close.cluster.lock', label: 'Lock the Cluster' }],
      },
      {
        title: 'All other labs',
        items: [{ id: 'gen.close.others.confirm', label: 'Confirm the other labs have been closed' }],
      },
    ],
  },

  // ======================= BIG LAB =======================
  big_lab: {
    opening: [
      {
        title: 'Air Conditioning',
        items: [{ id: 'big.open.ac', label: 'Turn ON the AC and check it is not dripping' }],
      },
      {
        title: 'Turn ON Rotavaps',
        items: [
          { id: 'big.open.rota.bath', label: 'Water Bath' },
          { id: 'big.open.rota.pumps', label: 'Pumps' },
          { id: 'big.open.rota.rotavap', label: 'Rotavap' },
          { id: 'big.open.rota.chiller', label: 'Water Tap / Chiller' },
        ],
      },
      {
        title: 'Windows',
        items: [{ id: 'big.open.windows.curtains', label: 'Pull up curtains' }],
      },
      {
        title: 'Fumehoods',
        items: [{ id: 'big.open.fumehoods', label: 'Raise exhaustion from 2 to 5' }],
      },
    ],
    closing: [
      {
        title: 'Air Conditioning',
        items: [{ id: 'big.close.ac', label: 'Turn OFF the AC and check it is not dripping' }],
      },
      {
        title: 'Turn OFF Rotavaps',
        items: [
          { id: 'big.close.rota.bath', label: 'Water Bath' },
          { id: 'big.close.rota.pumps', label: 'Pumps' },
          { id: 'big.close.rota.rotavap', label: 'Rotavap' },
          { id: 'big.close.rota.chiller', label: 'Water Tap / Chiller' },
        ],
      },
      {
        title: 'Windows',
        items: [
          { id: 'big.close.windows.close', label: 'Close windows' },
          { id: 'big.close.windows.curtains', label: 'Roll down curtains' },
        ],
      },
      {
        title: 'Fumehoods',
        items: [{ id: 'big.close.fumehoods', label: 'Reduce exhaustion from 5 to 2' }],
      },
      {
        title: 'Water / Gas Taps',
        items: [
          { id: 'big.close.taps.temp', label: 'No temperature in reaction plates' },
          { id: 'big.close.taps.overnight', label: 'All overnight reactions are registered' },
          { id: 'big.close.taps.closed', label: 'Water and gas taps are closed' },
        ],
      },
      {
        title: 'UV Lamp',
        items: [{ id: 'big.close.uv', label: 'Check the UV Lamp is turned OFF' }],
      },
      {
        title: 'Distillation Systems',
        items: [
          { id: 'big.close.dist.water', label: 'Check water distillation' },
          { id: 'big.close.dist.acetone', label: 'Check acetone distillation' },
          { id: 'big.close.dist.rotavap', label: 'Check big rotavap' },
        ],
      },
    ],
  },

  // ==================== SMALL LAB / GC ROOM ====================
  small_lab_gc: {
    opening: [
      {
        title: 'Air Conditioning',
        items: [{ id: 'small.open.ac', label: 'Turn ON the AC and check it is not dripping' }],
      },
      {
        title: 'Turn ON Rotavaps',
        items: [
          { id: 'small.open.rota.bath', label: 'Water Bath' },
          { id: 'small.open.rota.pumps', label: 'Pumps' },
          { id: 'small.open.rota.rotavap', label: 'Rotavap' },
          { id: 'small.open.rota.chiller', label: 'Water Tap / Chiller' },
        ],
      },
      {
        title: 'Windows',
        items: [{ id: 'small.open.windows.curtains', label: 'Pull up curtains' }],
      },
      {
        title: 'Fumehoods',
        items: [{ id: 'small.open.fumehoods', label: 'Raise exhaustion from 2 to 5' }],
      },
      {
        title: 'GC Room',
        items: [{ id: 'small.open.gc.ac', label: 'Check AC is ON and not dripping' }],
      },
    ],
    closing: [
      {
        title: 'Air Conditioning',
        items: [{ id: 'small.close.ac', label: 'Turn OFF the AC and check it is not dripping' }],
      },
      {
        title: 'Turn OFF Rotavaps',
        items: [
          { id: 'small.close.rota.bath', label: 'Water Bath' },
          { id: 'small.close.rota.pumps', label: 'Pumps' },
          { id: 'small.close.rota.rotavap', label: 'Rotavap' },
          { id: 'small.close.rota.chiller', label: 'Water Tap / Chiller' },
        ],
      },
      {
        title: 'Windows',
        items: [
          { id: 'small.close.windows.close', label: 'Close windows' },
          { id: 'small.close.windows.curtains', label: 'Roll down curtains' },
        ],
      },
      {
        title: 'Fumehoods',
        items: [{ id: 'small.close.fumehoods', label: 'Reduce exhaustion from 5 to 2' }],
      },
      {
        title: 'Water / Gas Taps',
        items: [
          { id: 'small.close.taps.temp', label: 'No temperature in reaction plates' },
          { id: 'small.close.taps.overnight', label: 'All overnight reactions are registered' },
          { id: 'small.close.taps.closed', label: 'Water and gas taps are closed' },
        ],
      },
      {
        title: 'GC Room',
        items: [
          // Corrected from "AC is ON" (Open Question 1): closing turns it OFF.
          { id: 'small.close.gc.ac', label: 'Check the GC Room AC is turned OFF' },
          { id: 'small.close.gc.computers', label: 'Turn OFF computers and screens' },
        ],
      },
    ],
  },

  // ======================= BROMO LAB =======================
  bromo_lab: {
    opening: [
      {
        title: 'Air Conditioning',
        items: [{ id: 'bromo.open.ac', label: 'Turn ON the AC and check it is not dripping' }],
      },
      {
        title: 'Turn ON Rotavaps',
        items: [
          { id: 'bromo.open.rota.bath', label: 'Water Bath' },
          { id: 'bromo.open.rota.pumps', label: 'Pumps' },
          { id: 'bromo.open.rota.rotavap', label: 'Rotavap' },
          { id: 'bromo.open.rota.chiller', label: 'Water Tap / Chiller' },
        ],
      },
      {
        title: 'Fumehoods',
        items: [{ id: 'bromo.open.fumehoods', label: 'Turn ON the exhaustion' }],
      },
    ],
    closing: [
      {
        title: 'Air Conditioning',
        items: [{ id: 'bromo.close.ac', label: 'Turn OFF the AC and check it is not dripping' }],
      },
      {
        title: 'Turn OFF Rotavaps',
        items: [
          { id: 'bromo.close.rota.bath', label: 'Water Bath' },
          { id: 'bromo.close.rota.pumps', label: 'Pumps' },
          { id: 'bromo.close.rota.rotavap', label: 'Rotavap' },
          { id: 'bromo.close.rota.chiller', label: 'Water Tap / Chiller' },
        ],
      },
      {
        title: 'UV Lamp',
        items: [{ id: 'bromo.close.uv', label: 'Check the UV Lamp is turned OFF' }],
      },
      {
        title: 'Fumehoods',
        items: [{ id: 'bromo.close.fumehoods', label: 'Turn OFF the exhaustion' }],
      },
      {
        title: 'Water / Gas Taps',
        items: [
          { id: 'bromo.close.taps.temp', label: 'No temperature in reaction plates' },
          { id: 'bromo.close.taps.overnight', label: 'All overnight reactions are registered' },
          { id: 'bromo.close.taps.closed', label: 'Water and gas taps are closed' },
        ],
      },
      {
        title: 'Small Equipment',
        items: [
          { id: 'bromo.close.equip.combiflash', label: 'Turn OFF the CombiFlash' },
          { id: 'bromo.close.equip.ultrasounds', label: 'Turn OFF the Ultrasounds' },
        ],
      },
    ],
  },
}

/** Flat set of every valid item id, for quick client/server validation. */
export function allItemIds(): Set<string> {
  const ids = new Set<string>()
  for (const area of Object.values(CHECKLISTS))
    for (const proc of Object.values(area))
      for (const group of proc) for (const item of group.items) ids.add(item.id)
  return ids
}

/** Total item count for a given area + action (for the running "n / N" counter). */
export function itemCount(area: Area, action: ActionType): number {
  return CHECKLISTS[area][action].reduce((n, g) => n + g.items.length, 0)
}
