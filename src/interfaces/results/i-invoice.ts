import { EInvoiceStatus } from '../..'

export default interface IInvoice {
  bolt11: string
  memo: string
  amount: number
  amountMsat: number
  preImage?: string | null
  paymentHash: string
  settled: boolean
  settleDate: Date | null
  creationDate: Date
  expiry: number
  status: EInvoiceStatus
}
