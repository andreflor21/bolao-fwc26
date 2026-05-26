import { IsOptional, IsString, MaxLength } from 'class-validator';

export class MarkPaidBody {
  /**
   * Free-text payment reference (e.g. Pix txid, bank transfer ID). Optional
   * — operators can mark a payout as paid before the receipt is available
   * and update the reference later via a 2nd call.
   */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  paymentReference?: string;
}
