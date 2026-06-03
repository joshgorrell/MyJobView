import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface FAQItem {
  question: string;
  answer: string;
}

const faqs: FAQItem[] = [
  {
    question: "What happens to my punchlist after my trial ends?",
    answer: "Your punchlist items and history are saved even after your trial ends. However, you won't be able to create new items or request service until you subscribe to a VIP plan. All your previous tasks and photos remain accessible once you upgrade."
  },
  {
    question: "Can I cancel my VIP membership anytime?",
    answer: "Yes! There are no long-term contracts. You can cancel your VIP membership at any time. Your access will continue until the end of your current billing period."
  },
  {
    question: "What if I need to extend my trial period?",
    answer: "We understand that sometimes 90 days isn't enough. Contact us and we'll work with you to extend your Test & Tune trial if needed. We want you to have enough time to fully experience the benefits."
  },
  {
    question: "Do I get billed during the 90-day trial?",
    answer: "No! The 90-Day Test & Tune trial is completely free with no billing or credit card required. You only get billed if you choose to continue with a paid VIP membership after your trial expires."
  },
  {
    question: "What's the difference between Test & Tune and VIP membership?",
    answer: "Test & Tune is our 90-day free trial program offered after project completion to help perfect your system. VIP membership is the ongoing paid subscription that provides the same benefits year-round, including punchlist access, priority service, and regular maintenance."
  },
  {
    question: "Can I change my VIP plan later?",
    answer: "Absolutely! You can upgrade or downgrade your VIP plan at any time. Changes take effect at your next billing cycle, and we'll prorate any differences."
  },
  {
    question: "What happens if I have open punchlist items when my trial expires?",
    answer: "Don't worry! Any service requests you've already submitted will be completed regardless of your trial status. We'll finish what we started. However, you won't be able to submit new items without upgrading to a VIP plan."
  },
  {
    question: "How is VIP service different from regular service?",
    answer: "VIP members get priority scheduling (faster appointments), direct punchlist access (no phone calls needed), dedicated support, and regular maintenance visits. Standard customers can still call for service, but may experience longer wait times."
  }
];

export function VIPMembershipFAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      <h3 className="text-xl font-bold text-gray-900 mb-4">Frequently Asked Questions</h3>
      <div className="space-y-3">
        {faqs.map((faq, index) => (
          <div key={index} className="border border-gray-200 rounded-lg overflow-hidden">
            <button
              onClick={() => setOpenIndex(openIndex === index ? null : index)}
              className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors text-left"
            >
              <span className="font-semibold text-gray-900 pr-4">{faq.question}</span>
              {openIndex === index ? (
                <ChevronUp className="w-5 h-5 text-gray-600 flex-shrink-0" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-600 flex-shrink-0" />
              )}
            </button>
            {openIndex === index && (
              <div className="px-4 py-3 bg-white">
                <p className="text-gray-700">{faq.answer}</p>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
        <p className="text-gray-700 text-sm">
          <strong>Have more questions?</strong> We're here to help! Contact us anytime and we'll be happy to answer
          any questions about VIP membership or your Test & Tune trial.
        </p>
      </div>
    </div>
  );
}
