export const REPORT_LIMITS: Readonly<{bytes:number;summary:number;itemSummary:number;detail:number}>;
export class ReportError extends Error { constructor(code:string,field:string,message:string,details?:Record<string,unknown>); code:string; field:string; limit?:number; actual?:number; }
export function checkReportSize(raw:string):number;
export function parseReport(raw:string):ReturnType<typeof validateReport>;
export function validateReport(b:unknown):{reportId:string;date:string;summary:string;items:Array<{id:string;title:string;status:string;summary:string;before:string;after:string;action:string;priority:string;category:string;observedAt:string;urls:string[]}>};
