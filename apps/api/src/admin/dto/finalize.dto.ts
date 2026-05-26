import { IsBoolean, IsOptional } from 'class-validator';

export class FinalizeClosureBody {
  /**
   * Bypass the "all 32 knockout matches must have official results" check.
   * Defaults to false. Use only when the operator explicitly accepts that
   * downstream payouts will be computed off the current ranking even though
   * KO scoring isn't fully recorded.
   */
  @IsOptional()
  @IsBoolean()
  confirmIncompleteKnockouts?: boolean;
}
