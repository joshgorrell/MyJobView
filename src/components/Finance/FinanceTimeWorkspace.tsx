import { useState } from "react";
import { TimeReviewPanel } from "../Admin/Payroll/TimeReviewPanel";
import PayrollPeriodSummary from "../Admin/Payroll/PayrollPeriodSummary";
import PayrollEmployeeHoursSummary from "../Admin/Payroll/PayrollEmployeeHoursSummary";
import JurisdictionReviewPanel from "../Admin/Payroll/JurisdictionReviewPanel";
import PayrollApprovalPanel from "../Admin/Payroll/PayrollApprovalPanel";
import PayrollCorrectionsPanel from "../Admin/Payroll/PayrollCorrectionsPanel";
import PayrollReconciliationPanel from "../Admin/Payroll/PayrollReconciliationPanel";
import { AttendanceAllocationSummary } from "../Admin/Payroll/AttendanceAllocationSummary";

export function FinanceTimeWorkspace({
  review = false,
  onPayroll,
}: {
  review?: boolean;
  onPayroll?: () => void;
}) {
  const [period, setPeriod] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  return (
    <div className="space-y-6 min-w-0">
      <h2 className="text-xl font-bold text-primary">
        {review ? "Time Approval" : "Payroll"}
      </h2>
      {review ? (
        <TimeReviewPanel onPayroll={onPayroll} />
      ) : (
        <>
          <PayrollPeriodSummary
            onPeriodSelect={setPeriod}
            onRefresh={() => setVersion((v) => v + 1)}
          />
          <PayrollEmployeeHoursSummary
            key={`hours-${version}`}
            payPeriodId={period}
          />
          <AttendanceAllocationSummary payPeriodId={period} />
          <JurisdictionReviewPanel
            key={`jurisdiction-${version}`}
            payPeriodId={period}
          />
          <PayrollReconciliationPanel
            key={`reconciliation-${version}`}
            payPeriodId={period}
          />
          <PayrollApprovalPanel
            key={`approval-${version}`}
            payPeriodId={period}
          />
          <PayrollCorrectionsPanel
            key={`correction-${version}`}
            payPeriodId={period}
          />
        </>
      )}
    </div>
  );
}
