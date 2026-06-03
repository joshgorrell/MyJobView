import { BookOpen, Users, Briefcase, Activity, MessageSquare, CheckSquare, CreditCard, Fish, TrendingUp, Bell, Hash, AtSign, Calendar, Building2, UserPlus, Settings, Lightbulb } from 'lucide-react';

export function HowItWorks() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 py-6 sm:py-12 px-3 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        <div className="bg-white rounded-xl sm:rounded-2xl shadow-2xl p-4 sm:p-8 lg:p-12">
          <div className="text-center mb-6 sm:mb-12">
            <BookOpen className="w-10 h-10 sm:w-16 sm:h-16 mx-auto mb-3 sm:mb-4 text-purple-600" />
            <h1 className="text-2xl sm:text-4xl font-bold text-gray-900 mb-1 sm:mb-2">How It Works</h1>
            <p className="text-sm sm:text-lg text-gray-600">Your complete guide to using Sales Lead Manager</p>
          </div>

          <div className="space-y-6 sm:space-y-12">
            <section>
              <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-6">
                <Users className="w-6 h-6 sm:w-8 sm:h-8 text-blue-600 flex-shrink-0" />
                <h2 className="text-xl sm:text-3xl font-bold text-gray-900">Contacts</h2>
              </div>
              <div className="space-y-3 sm:space-y-4 text-gray-700 ml-0 sm:ml-11">
                <p className="text-sm sm:text-lg leading-relaxed">
                  <strong>Contacts</strong> are your core database of people and companies. Think of this as your digital rolodex.
                </p>
                <ul className="list-disc pl-5 sm:pl-6 space-y-1 sm:space-y-2 text-sm sm:text-base">
                  <li>Store contact information including name, email, phone, company, title, and addresses</li>
                  <li>Upload business card photos for easy reference</li>
                  <li>Assign contacts to specific sales offices for territory management</li>
                  <li>Assign contacts to specific sales reps for account ownership</li>
                  <li>Add detailed notes and track conversation history</li>
                  <li>Contacts sync with QuickBooks Online (if enabled by admin)</li>
                  <li>Set reminder dates to follow up with contacts</li>
                  <li>Create Google Calendar events directly from contacts (if connected)</li>
                </ul>
              </div>
            </section>

            <section>
              <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-6">
                <Briefcase className="w-6 h-6 sm:w-8 sm:h-8 text-green-600 flex-shrink-0" />
                <h2 className="text-xl sm:text-3xl font-bold text-gray-900">Leads</h2>
              </div>
              <div className="space-y-3 sm:space-y-4 text-gray-700 ml-0 sm:ml-11">
                <p className="text-sm sm:text-lg leading-relaxed">
                  <strong>Leads</strong> are active sales opportunities. When a contact becomes a potential sale, create a lead to track the opportunity.
                </p>

                <div className="mt-3 sm:mt-4">
                  <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2 sm:mb-3">Lead Stages</h3>
                  <ul className="list-disc pl-5 sm:pl-6 space-y-1 sm:space-y-2 text-sm sm:text-base">
                    <li><strong>New:</strong> Fresh lead just entered the system</li>
                    <li><strong>Contacted:</strong> Initial outreach has been made</li>
                    <li><strong>Qualified:</strong> Confirmed as a legitimate opportunity</li>
                    <li><strong>Proposal:</strong> Quote or proposal has been sent</li>
                    <li><strong>Won:</strong> Deal closed successfully</li>
                    <li><strong>Lost:</strong> Opportunity didn't convert</li>
                  </ul>
                </div>

                <div className="mt-3 sm:mt-4">
                  <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2 sm:mb-3">Lead Priority</h3>
                  <ul className="list-disc pl-5 sm:pl-6 space-y-1 sm:space-y-2 text-sm sm:text-base">
                    <li><strong>Low:</strong> Future opportunities or low-value leads</li>
                    <li><strong>Medium:</strong> Standard priority leads</li>
                    <li><strong>High:</strong> Hot leads requiring immediate attention</li>
                  </ul>
                </div>

                <div className="mt-3 sm:mt-4">
                  <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2 sm:mb-3">Lead Features</h3>
                  <ul className="list-disc pl-5 sm:pl-6 space-y-1 sm:space-y-2 text-sm sm:text-base">
                    <li>Tag leads with keywords for easy filtering and organization</li>
                    <li>Add internal messages and notes visible to your team</li>
                    <li>Claim leads to take ownership of opportunities</li>
                    <li>Track lead value and estimated revenue</li>
                    <li>Set reminder dates for follow-ups</li>
                    <li>Create Google Calendar events for lead activities</li>
                    <li>View complete history of all changes and updates</li>
                  </ul>
                </div>
              </div>
            </section>

            <section>
              <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-6">
                <Activity className="w-6 h-6 sm:w-8 sm:h-8 text-cyan-600 flex-shrink-0" />
                <h2 className="text-xl sm:text-3xl font-bold text-gray-900">Dashboard</h2>
              </div>
              <div className="space-y-3 sm:space-y-4 text-gray-700 ml-0 sm:ml-11">
                <p className="text-sm sm:text-lg leading-relaxed">
                  The <strong>Dashboard</strong> is your real-time activity stream showing everything happening across your sales team.
                </p>
                <ul className="list-disc pl-5 sm:pl-6 space-y-1 sm:space-y-2 text-sm sm:text-base">
                  <li>See all lead updates, status changes, and team activities</li>
                  <li>View discussion posts, questions, and task updates</li>
                  <li>Filter by specific team members using <span className="text-blue-600 font-semibold">@username</span></li>
                  <li>Filter by topics using <span className="text-cyan-600 font-semibold">#hashtags</span></li>
                  <li>Search discussions by keywords</li>
                  <li>View only posts where you've been mentioned</li>
                  <li>Like and reply to posts to keep conversations going</li>
                  <li>Post three types of content: General updates, Questions, or Tasks</li>
                </ul>
              </div>
            </section>

            <section>
              <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-6">
                <MessageSquare className="w-6 h-6 sm:w-8 sm:h-8 text-purple-600 flex-shrink-0" />
                <h2 className="text-xl sm:text-3xl font-bold text-gray-900">Discussion Posts</h2>
              </div>
              <div className="space-y-3 sm:space-y-4 text-gray-700 ml-0 sm:ml-11">
                <p className="text-sm sm:text-lg leading-relaxed">
                  <strong>Discussion Posts</strong> enable team collaboration and communication around leads and projects.
                </p>

                <div className="mt-3 sm:mt-4">
                  <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2 sm:mb-3">Post Types</h3>
                  <ul className="list-disc pl-5 sm:pl-6 space-y-1 sm:space-y-2 text-sm sm:text-base">
                    <li><strong>General:</strong> Regular updates and announcements</li>
                    <li><strong>Question:</strong> Ask your team for help or input</li>
                    <li><strong>Task:</strong> Assign work or track to-dos</li>
                  </ul>
                </div>

                <div className="mt-3 sm:mt-4">
                  <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2 sm:mb-3">Mentions & Hashtags</h3>
                  <ul className="list-disc pl-5 sm:pl-6 space-y-1 sm:space-y-2 text-sm sm:text-base">
                    <li>Use <span className="text-blue-600 font-semibold">@username</span> to mention team members and notify them</li>
                    <li>Use <span className="text-cyan-600 font-semibold">#hashtag</span> to categorize posts by topic or project</li>
                    <li>Click mentions or hashtags to filter and find related discussions</li>
                    <li>Mentioned users receive email notifications (if enabled in preferences)</li>
                  </ul>
                </div>

                <div className="mt-3 sm:mt-4 bg-orange-50 border-l-4 border-orange-500 p-3 sm:p-4">
                  <div className="flex items-start gap-2 sm:gap-3">
                    <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6 text-orange-600 flex-shrink-0 mt-1" />
                    <div>
                      <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-1 sm:mb-2">Bumping Posts</h3>
                      <p className="text-sm sm:text-base text-gray-700 mb-2">
                        If a discussion post (especially a question) isn't getting answered, you can <strong>bump</strong> it to push it back to the top of the feed.
                      </p>
                      <ul className="list-disc pl-5 sm:pl-6 space-y-1 text-xs sm:text-sm text-gray-700">
                        <li>Only unanswered posts (no replies) can be bumped</li>
                        <li>Posts must be at least 4 hours old to bump</li>
                        <li>Can only bump once every 24 hours to prevent spam</li>
                        <li>Bumping sends reminder notifications to mentioned users</li>
                        <li>Bump count is displayed so you can see how many times a post has been bumped</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="mt-3 sm:mt-4">
                  <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2 sm:mb-3">Replies & Threading</h3>
                  <ul className="list-disc pl-5 sm:pl-6 space-y-1 sm:space-y-2 text-sm sm:text-base">
                    <li>Reply to any post to keep discussions organized</li>
                    <li>Replies appear nested under the original post</li>
                    <li>Like replies just like main posts</li>
                    <li>Reply count is displayed on each post</li>
                  </ul>
                </div>
              </div>
            </section>

            <section>
              <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-6">
                <Fish className="w-6 h-6 sm:w-8 sm:h-8 text-purple-600 flex-shrink-0" />
                <h2 className="text-xl sm:text-3xl font-bold text-gray-900">Fishbowl</h2>
              </div>
              <div className="space-y-3 sm:space-y-4 text-gray-700 ml-0 sm:ml-11">
                <p className="text-sm sm:text-lg leading-relaxed">
                  The <strong>Fishbowl</strong> is your shared lead pool where unclaimed leads are available for anyone on the team to claim.
                </p>
                <ul className="list-disc pl-5 sm:pl-6 space-y-1 sm:space-y-2 text-sm sm:text-base">
                  <li>View all unclaimed leads in one central location</li>
                  <li>Click "Claim Lead" to take ownership of an opportunity</li>
                  <li>Once claimed, the lead moves to your personal leads list</li>
                  <li>Perfect for distributing inbound leads fairly across the team</li>
                  <li>Encourages healthy competition and prevents leads from being forgotten</li>
                  <li>Filter and sort fishbowl leads by priority, value, or date</li>
                </ul>
              </div>
            </section>

            <section>
              <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-6">
                <CheckSquare className="w-6 h-6 sm:w-8 sm:h-8 text-blue-600 flex-shrink-0" />
                <h2 className="text-xl sm:text-3xl font-bold text-gray-900">Tasks</h2>
              </div>
              <div className="space-y-3 sm:space-y-4 text-gray-700 ml-0 sm:ml-11">
                <p className="text-sm sm:text-lg leading-relaxed">
                  <strong>Tasks</strong> help you track your to-do items and follow-ups.
                </p>
                <ul className="list-disc pl-5 sm:pl-6 space-y-1 sm:space-y-2 text-sm sm:text-base">
                  <li>Create tasks with titles, descriptions, and due dates</li>
                  <li>Assign tasks to yourself or other team members</li>
                  <li>Link tasks to specific leads for context</li>
                  <li>Mark tasks as complete when finished</li>
                  <li>View pending tasks to stay organized</li>
                  <li>Task updates appear in the Dashboard</li>
                  <li>Set priorities to focus on what matters most</li>
                </ul>
              </div>
            </section>

            <section>
              <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-6">
                <CreditCard className="w-6 h-6 sm:w-8 sm:h-8 text-pink-600 flex-shrink-0" />
                <h2 className="text-xl sm:text-3xl font-bold text-gray-900">My Card (Digital Business Card)</h2>
              </div>
              <div className="space-y-3 sm:space-y-4 text-gray-700 ml-0 sm:ml-11">
                <p className="text-sm sm:text-lg leading-relaxed">
                  <strong>My Card</strong> is your personal digital business card that you can share with prospects and customers.
                </p>
                <ul className="list-disc pl-5 sm:pl-6 space-y-1 sm:space-y-2 text-sm sm:text-base">
                  <li>Create a beautiful, mobile-friendly digital business card</li>
                  <li>Include your photo, contact info, bio, and social media links</li>
                  <li>Choose from multiple professional themes and color schemes</li>
                  <li>Get a unique shareable URL (e.g., yourcompany.com/card/yourname)</li>
                  <li>Generate a QR code that people can scan to view your card instantly</li>
                  <li>Download your card as a vCard to import into any contact app</li>
                  <li>Share via email, text, or social media</li>
                  <li>Update your card anytime and changes appear immediately</li>
                  <li>Track views and engagement on your digital card</li>
                </ul>
              </div>
            </section>

            <section>
              <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-6">
                <Bell className="w-6 h-6 sm:w-8 sm:h-8 text-yellow-600 flex-shrink-0" />
                <h2 className="text-xl sm:text-3xl font-bold text-gray-900">Notifications</h2>
              </div>
              <div className="space-y-3 sm:space-y-4 text-gray-700 ml-0 sm:ml-11">
                <p className="text-sm sm:text-lg leading-relaxed">
                  Stay informed with <strong>real-time notifications</strong> about important activities.
                </p>
                <ul className="list-disc pl-5 sm:pl-6 space-y-1 sm:space-y-2 text-sm sm:text-base">
                  <li>Get notified when you're mentioned in discussions</li>
                  <li>Receive alerts when new leads are added to the Fishbowl</li>
                  <li>Track when leads you're following change status</li>
                  <li>See when tasks are assigned to you</li>
                  <li>Email notifications can be enabled/disabled in My Settings</li>
                  <li>Click the bell icon in the header to view all notifications</li>
                  <li>Unread notifications are highlighted</li>
                  <li>Mark notifications as read to keep your inbox clean</li>
                </ul>
              </div>
            </section>

            <section>
              <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-6">
                <Calendar className="w-6 h-6 sm:w-8 sm:h-8 text-teal-600 flex-shrink-0" />
                <h2 className="text-xl sm:text-3xl font-bold text-gray-900">Calendar Integration</h2>
              </div>
              <div className="space-y-3 sm:space-y-4 text-gray-700 ml-0 sm:ml-11">
                <p className="text-sm sm:text-lg leading-relaxed">
                  Connect your <strong>Google Calendar</strong> to sync events directly from the app.
                </p>
                <ul className="list-disc pl-5 sm:pl-6 space-y-1 sm:space-y-2 text-sm sm:text-base">
                  <li>Connect your Google account in My Settings</li>
                  <li>Create calendar events from leads, contacts, or tasks</li>
                  <li>Set reminder dates that sync with your calendar</li>
                  <li>Events include all relevant lead/contact information</li>
                  <li>Update or cancel events directly from the app</li>
                  <li>Calendar integration is optional and per-user</li>
                </ul>
              </div>
            </section>

            <section>
              <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-6">
                <Building2 className="w-6 h-6 sm:w-8 sm:h-8 text-indigo-600 flex-shrink-0" />
                <h2 className="text-xl sm:text-3xl font-bold text-gray-900">Sales Offices & Assignments</h2>
              </div>
              <div className="space-y-3 sm:space-y-4 text-gray-700 ml-0 sm:ml-11">
                <p className="text-sm sm:text-lg leading-relaxed">
                  Manage <strong>multiple sales offices</strong> and assign team members for territory management.
                </p>
                <ul className="list-disc pl-5 sm:pl-6 space-y-1 sm:space-y-2 text-sm sm:text-base">
                  <li>Admins can create and manage company sales offices</li>
                  <li>Assign users to specific offices for regional organization</li>
                  <li>Assign contacts to offices for territory tracking</li>
                  <li>Filter contacts and leads by office location</li>
                  <li>Track performance by office or region</li>
                  <li>Perfect for distributed sales teams</li>
                </ul>
              </div>
            </section>

            <section>
              <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-6">
                <UserPlus className="w-6 h-6 sm:w-8 sm:h-8 text-emerald-600 flex-shrink-0" />
                <h2 className="text-xl sm:text-3xl font-bold text-gray-900">Offline Mode</h2>
              </div>
              <div className="space-y-3 sm:space-y-4 text-gray-700 ml-0 sm:ml-11">
                <p className="text-sm sm:text-lg leading-relaxed">
                  Work seamlessly even without an internet connection with <strong>offline mode</strong>.
                </p>
                <ul className="list-disc pl-5 sm:pl-6 space-y-1 sm:space-y-2 text-sm sm:text-base">
                  <li>All data is cached locally for offline access</li>
                  <li>Create, edit, and view contacts and leads offline</li>
                  <li>Changes sync automatically when you reconnect</li>
                  <li>Offline indicator appears when disconnected</li>
                  <li>Perfect for trade shows, remote areas, or poor connectivity</li>
                  <li>No data loss - everything syncs when back online</li>
                </ul>
              </div>
            </section>

            <section>
              <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-6">
                <Settings className="w-6 h-6 sm:w-8 sm:h-8 text-orange-600 flex-shrink-0" />
                <h2 className="text-xl sm:text-3xl font-bold text-gray-900">Admin Features</h2>
              </div>
              <div className="space-y-3 sm:space-y-4 text-gray-700 ml-0 sm:ml-11">
                <p className="text-sm sm:text-lg leading-relaxed">
                  Admins have access to <strong>powerful management tools</strong> for controlling the system.
                </p>

                <div className="mt-3 sm:mt-4">
                  <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2 sm:mb-3">User Management</h3>
                  <ul className="list-disc pl-5 sm:pl-6 space-y-1 sm:space-y-2 text-sm sm:text-base">
                    <li>Add new users with email invitations</li>
                    <li>Set user roles (Admin, Manager, Sales Rep, Viewer)</li>
                    <li>Activate or deactivate user accounts</li>
                    <li>Reset user passwords</li>
                    <li>Assign users to sales offices</li>
                    <li>View and manage all team members</li>
                  </ul>
                </div>

                <div className="mt-3 sm:mt-4">
                  <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2 sm:mb-3">Company Settings</h3>
                  <ul className="list-disc pl-5 sm:pl-6 space-y-1 sm:space-y-2 text-sm sm:text-base">
                    <li>Set company name and branding</li>
                    <li>Upload company logo for business cards</li>
                    <li>Configure email notification preferences</li>
                    <li>Manage sales offices and locations</li>
                    <li>Control system-wide settings</li>
                  </ul>
                </div>

                <div className="mt-3 sm:mt-4">
                  <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2 sm:mb-3">QuickBooks Integration</h3>
                  <ul className="list-disc pl-5 sm:pl-6 space-y-1 sm:space-y-2 text-sm sm:text-base">
                    <li>Connect to QuickBooks Online</li>
                    <li>Sync contacts as QuickBooks customers</li>
                    <li>Create invoices directly from contacts</li>
                    <li>Track sync status and history</li>
                    <li>Automatically update when contacts change</li>
                  </ul>
                </div>

                <div className="mt-3 sm:mt-4">
                  <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2 sm:mb-3">Feature Suggestions</h3>
                  <ul className="list-disc pl-5 sm:pl-6 space-y-1 sm:space-y-2 text-sm sm:text-base">
                    <li>Review feature requests from team members</li>
                    <li>Vote on suggestions to prioritize development</li>
                    <li>Mark suggestions as implemented or in progress</li>
                    <li>Provide feedback and updates to requesters</li>
                  </ul>
                </div>
              </div>
            </section>

            <section>
              <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-6">
                <Lightbulb className="w-6 h-6 sm:w-8 sm:h-8 text-yellow-600 flex-shrink-0" />
                <h2 className="text-xl sm:text-3xl font-bold text-gray-900">Tips & Best Practices</h2>
              </div>
              <div className="space-y-3 sm:space-y-4 text-gray-700 ml-0 sm:ml-11">
                <ul className="list-disc pl-5 sm:pl-6 space-y-2 sm:space-y-3 text-sm sm:text-base">
                  <li><strong>Keep contacts updated:</strong> Regularly update contact information to maintain data quality</li>
                  <li><strong>Use hashtags consistently:</strong> Create a tagging system for easy filtering (e.g., #urgent, #q4, #follow-up)</li>
                  <li><strong>Check the Fishbowl daily:</strong> Claim leads quickly to prevent them from going stale</li>
                  <li><strong>Set reminder dates:</strong> Never forget to follow up by setting reminders on leads and contacts</li>
                  <li><strong>Use discussions for transparency:</strong> Post updates about big wins or challenges to keep the team informed</li>
                  <li><strong>Assign tasks proactively:</strong> Don't let opportunities slip through the cracks</li>
                  <li><strong>Update lead stages regularly:</strong> Keep your pipeline accurate for better forecasting</li>
                  <li><strong>Share your digital card:</strong> Add it to your email signature and social profiles</li>
                  <li><strong>Bump important questions:</strong> If a critical question isn't getting answered, use the bump feature</li>
                  <li><strong>Review notifications daily:</strong> Stay on top of mentions and assignments</li>
                </ul>
              </div>
            </section>

            <div className="mt-6 sm:mt-12 pt-4 sm:pt-8 border-t border-gray-200 text-center">
              <p className="text-gray-600 text-sm sm:text-lg">
                Need help? Have suggestions? Click the "Suggestions?" link in the footer to submit feedback!
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
