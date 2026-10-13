// Camera presets in model space (metres; front of the mannequin faces +Z, her left is +X).
export const VIEWS = {
  front:  { label: 'Front',  pos: [0, 1.08, 3.75],    target: [0, 0.84, 0] },
  side:   { label: 'Side',   pos: [3.55, 1.08, 1.0],  target: [0, 0.84, 0] },
  back:   { label: 'Back',   pos: [0, 1.1, -3.75],    target: [0, 0.84, 0] },
  pallu:  { label: 'Pallu',  pos: [0.9, 1.34, 1.5],   target: [0.03, 1.13, 0] },
  pleats: { label: 'Pleats', pos: [0.32, 0.62, 1.55], target: [0, 0.46, 0.05] },
};
