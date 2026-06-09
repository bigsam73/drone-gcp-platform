export type RecommendationPresetId =
  | 'standard'
  | 'pix4d-default'
  | 'pix4d-precision'
  | 'agisoft'
  | 'ngii'
  | 'asprs';

export type RecommendationPreset = {
  id: RecommendationPresetId;
  name: string;
  description: string;
  source: string;
  formula: (areaHa: number) => number;
};

const guard = (ha: number, f: () => number) => (ha <= 0 ? 0 : f());

export const PRESETS: RecommendationPreset[] = [
  {
    id: 'standard',
    name: 'Standard (기본)',
    description: '범용 기본값. 작은 면적은 5개, 큰 면적은 10ha당 1개씩 추가.',
    source: '내부 권장',
    formula: (ha) => guard(ha, () => Math.max(5, Math.ceil(ha / 10) + 4)),
  },
  {
    id: 'pix4d-default',
    name: 'Pix4D Default',
    description: '평범한 프로젝트(5–10개 권장). 면적이 클 때 보수적.',
    source: 'Pix4D 공식 가이드',
    formula: (ha) => guard(ha, () => Math.max(5, Math.ceil(ha / 20) + 4)),
  },
  {
    id: 'pix4d-precision',
    name: 'Pix4D Precision',
    description: '고도 정확도가 중요할 때 (예: 토공량 산정). 최소 10개.',
    source: 'Pix4D 정밀 매핑 권장',
    formula: (ha) => guard(ha, () => Math.max(10, Math.ceil(ha / 10) + 9)),
  },
  {
    id: 'agisoft',
    name: 'Agisoft Metashape',
    description: '4–10개 표준. Pix4D Default와 Standard 중간.',
    source: 'Agisoft Metashape 매뉴얼',
    formula: (ha) => guard(ha, () => Math.max(5, Math.ceil(ha / 15) + 4)),
  },
  {
    id: 'ngii',
    name: '국토지리정보원 (1:1,000)',
    description: '한국 드론공공측량 작업규정. 1km²(100ha)당 9개 이상.',
    source: '국토지리정보원 공공측량 작업규정',
    formula: (ha) => guard(ha, () => Math.max(9, Math.ceil(ha / 11.2))),
  },
  {
    id: 'asprs',
    name: 'ASPRS (RMSE 1px)',
    description: '사진측량 학회 표준. RMSE 1픽셀 목표.',
    source: 'ASPRS Positional Accuracy Standards',
    formula: (ha) => guard(ha, () => Math.max(5, Math.ceil(ha / 20) + 3)),
  },
];

export const DEFAULT_PRESET_ID: RecommendationPresetId = 'standard';

const PRESET_MAP = new Map(PRESETS.map((p) => [p.id, p]));

export function getPreset(id: RecommendationPresetId): RecommendationPreset {
  return PRESET_MAP.get(id) ?? PRESETS[0];
}

export function isValidPresetId(id: string): id is RecommendationPresetId {
  return PRESET_MAP.has(id as RecommendationPresetId);
}
