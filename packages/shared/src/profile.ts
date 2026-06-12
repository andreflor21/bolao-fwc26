/**
 * Evolução de um participante no ranking geral, jogo a jogo. Cada checkpoint
 * corresponde a um jogo já encerrado (com resultado oficial), em ordem
 * cronológica de kickoff. Para cada checkpoint expomos duas métricas:
 *  - `points`: pontos acumulados até aquele jogo.
 *  - `position`: posição no ranking geral (1 = topo) naquele momento.
 */
export interface EvolutionPointDto {
  /** Número do jogo no calendário da competição (1 a 104), usado no eixo X. */
  gameNumber: number;
  /** Rótulo curto do jogo, ex.: "BRA×SRB" (mostrado no tooltip). */
  label: string;
  /** Kickoff em ISO, para ordenação/tooltip. */
  kickoffAt: string;
}

export interface EvolutionSeriesDto {
  /** Pontos acumulados em cada checkpoint. */
  points: number[];
  /** Posição no ranking geral em cada checkpoint (1-indexed). */
  position: number[];
}

export interface RankingEvolutionDto {
  /** Checkpoints (jogos encerrados) em ordem cronológica. */
  checkpoints: EvolutionPointDto[];
  /** Série do perfil acessado. */
  target: EvolutionSeriesDto;
  /** Série do solicitante; null quando ele está vendo o próprio perfil. */
  self: EvolutionSeriesDto | null;
  /** True quando o perfil acessado é o do próprio solicitante. */
  isSelf: boolean;
  /** Nome do perfil acessado. */
  targetName: string;
  /** Nome do solicitante (para a legenda). */
  selfName: string;
  /** Total de participantes ranqueados (denominador do eixo de posição). */
  totalPlayers: number;
}
