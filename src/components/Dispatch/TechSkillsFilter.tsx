import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { formatRoleName } from '../../lib/utils';
import {
  Award,
  Star,
  Filter,
  X,
  CheckCircle,
  User
} from 'lucide-react';

interface SkillCategory {
  id: string;
  name: string;
  description: string | null;
}

interface Skill {
  id: string;
  name: string;
  description: string | null;
  category_id: string;
}

interface TechnicianWithSkills {
  id: string;
  full_name: string;
  role: string;
  technician_skills: Array<{
    skill_id: string;
    proficiency_level: string;
    certified: boolean;
    skills: {
      id: string;
      name: string;
      category_id: string;
    };
  }>;
}

interface TechSkillsFilterProps {
  onTechnicianSelect: (techId: string) => void;
  onClose?: () => void;
}

export function TechSkillsFilter({ onTechnicianSelect, onClose }: TechSkillsFilterProps) {
  const [categories, setCategories] = useState<SkillCategory[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [technicians, setTechnicians] = useState<TechnicianWithSkills[]>([]);
  const [selectedSkills, setSelectedSkills] = useState<Set<string>>(new Set());
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [minProficiency, setMinProficiency] = useState<string>('beginner');
  const [requireCertified, setRequireCertified] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSkillsData();
  }, []);

  useEffect(() => {
    if (selectedSkills.size > 0) {
      filterTechnicians();
    } else {
      loadAllTechnicians();
    }
  }, [selectedSkills, minProficiency, requireCertified]);

  async function loadSkillsData() {
    try {
      const [categoriesResult, skillsResult] = await Promise.all([
        supabase
          .from('skill_categories')
          .select('*')
          .eq('is_active', true)
          .order('display_order'),

        supabase
          .from('skills')
          .select('*')
          .eq('is_active', true)
          .order('display_order')
      ]);

      if (categoriesResult.error) throw categoriesResult.error;
      if (skillsResult.error) throw skillsResult.error;

      setCategories(categoriesResult.data || []);
      setSkills(skillsResult.data || []);
      await loadAllTechnicians();
    } catch (error) {
      console.error('Error loading skills:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadAllTechnicians() {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select(`
          id,
          full_name,
          role,
          technician_skills (
            skill_id,
            proficiency_level,
            certified,
            skills (
              id,
              name,
              category_id
            )
          )
        `)
        .in('role', ['tech'])
        .order('full_name');

      if (error) throw error;
      setTechnicians(data || []);
    } catch (error) {
      console.error('Error loading technicians:', error);
    }
  }

  async function filterTechnicians() {
    if (selectedSkills.size === 0) {
      await loadAllTechnicians();
      return;
    }

    try {
      const proficiencyOrder = { beginner: 1, intermediate: 2, expert: 3 };
      const minLevel = proficiencyOrder[minProficiency as keyof typeof proficiencyOrder];

      const { data, error } = await supabase
        .from('profiles')
        .select(`
          id,
          full_name,
          role,
          technician_skills (
            skill_id,
            proficiency_level,
            certified,
            skills (
              id,
              name,
              category_id
            )
          )
        `)
        .in('role', ['tech'])
        .order('full_name');

      if (error) throw error;

      const filtered = (data || []).filter(tech => {
        const techSkills = tech.technician_skills || [];

        return Array.from(selectedSkills).every(requiredSkillId => {
          const techSkill = techSkills.find(ts => ts.skill_id === requiredSkillId);

          if (!techSkill) return false;

          const techProficiencyLevel = proficiencyOrder[techSkill.proficiency_level as keyof typeof proficiencyOrder];
          if (techProficiencyLevel < minLevel) return false;

          if (requireCertified && !techSkill.certified) return false;

          return true;
        });
      });

      setTechnicians(filtered);
    } catch (error) {
      console.error('Error filtering technicians:', error);
    }
  }

  function toggleSkill(skillId: string) {
    const newSelected = new Set(selectedSkills);
    if (newSelected.has(skillId)) {
      newSelected.delete(skillId);
    } else {
      newSelected.add(skillId);
    }
    setSelectedSkills(newSelected);
  }

  function clearFilters() {
    setSelectedSkills(new Set());
    setSelectedCategory(null);
    setMinProficiency('beginner');
    setRequireCertified(false);
  }

  function getProficiencyBadge(level: string) {
    switch (level) {
      case 'expert':
        return <span className="text-xs px-2 py-0.5 bg-yellow-500/20 text-yellow-400 rounded-full">Expert</span>;
      case 'intermediate':
        return <span className="text-xs px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded-full">Intermediate</span>;
      case 'beginner':
        return <span className="text-xs px-2 py-0.5 bg-gray-500/20 text-gray-400 rounded-full">Beginner</span>;
      default:
        return null;
    }
  }

  const filteredSkillsByCategory = selectedCategory
    ? skills.filter(s => s.category_id === selectedCategory)
    : skills;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading skills...</div>
      </div>
    );
  }

  return (
    <div className="h-full flex gap-4">
      <div className="w-80 flex flex-col bg-gray-800 rounded-lg border border-gray-700">
        <div className="p-4 border-b border-gray-700 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Filter className="w-5 h-5" />
            Filter by Skills
          </h3>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-700 rounded transition-colors"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          )}
        </div>

        <div className="p-4 space-y-4 flex-1 overflow-y-auto">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">Category</label>
            <select
              value={selectedCategory || ''}
              onChange={(e) => setSelectedCategory(e.target.value || null)}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Categories</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Required Skills
            </label>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {filteredSkillsByCategory.map(skill => (
                <label
                  key={skill.id}
                  className="flex items-start gap-3 p-2 hover:bg-gray-700 rounded cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selectedSkills.has(skill.id)}
                    onChange={() => toggleSkill(skill.id)}
                    className="mt-1 w-4 h-4 bg-gray-900 border-gray-600 rounded focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="flex-1">
                    <div className="text-sm text-white">{skill.name}</div>
                    {skill.description && (
                      <div className="text-xs text-gray-400 mt-0.5">{skill.description}</div>
                    )}
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Minimum Proficiency
            </label>
            <select
              value={minProficiency}
              onChange={(e) => setMinProficiency(e.target.value)}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500"
            >
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="expert">Expert</option>
            </select>
          </div>

          <div>
            <label className="flex items-center gap-3 p-3 bg-gray-900 rounded-lg cursor-pointer hover:bg-gray-700 transition-colors">
              <input
                type="checkbox"
                checked={requireCertified}
                onChange={(e) => setRequireCertified(e.target.checked)}
                className="w-4 h-4 bg-gray-900 border-gray-600 rounded focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex items-center gap-2">
                <Award className="w-4 h-4 text-yellow-400" />
                <span className="text-sm text-white">Require Certification</span>
              </div>
            </label>
          </div>

          {selectedSkills.size > 0 && (
            <button
              onClick={clearFilters}
              className="w-full px-4 py-2 bg-red-600/20 text-red-400 rounded-lg hover:bg-red-600/30 transition-colors text-sm font-medium"
            >
              Clear All Filters
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 bg-gray-800 rounded-lg border border-gray-700">
        <div className="p-4 border-b border-gray-700">
          <h3 className="text-lg font-semibold text-white">
            {technicians.length} Qualified {technicians.length === 1 ? 'Technician' : 'Technicians'}
          </h3>
          {selectedSkills.size > 0 && (
            <p className="text-sm text-gray-400 mt-1">
              Matching {selectedSkills.size} selected {selectedSkills.size === 1 ? 'skill' : 'skills'}
            </p>
          )}
        </div>

        <div className="p-4 space-y-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 20rem)' }}>
          {technicians.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              {selectedSkills.size > 0 ? (
                <>
                  <User className="w-16 h-16 mx-auto mb-4 text-gray-600" />
                  <p>No technicians match the selected criteria</p>
                  <p className="text-sm mt-2">Try adjusting your filters</p>
                </>
              ) : (
                <p>Select skills to filter technicians</p>
              )}
            </div>
          ) : (
            technicians.map(tech => (
              <div
                key={tech.id}
                className="bg-gray-900 rounded-lg border border-gray-700 p-4 hover:border-gray-600 transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="font-semibold text-white mb-1">{tech.full_name}</div>
                    <div className="text-sm text-gray-400">{formatRoleName(tech.role)}</div>
                  </div>
                  <button
                    onClick={() => onTechnicianSelect(tech.id)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                  >
                    Select
                  </button>
                </div>

                {tech.technician_skills && tech.technician_skills.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-gray-400 mb-2 flex items-center gap-1">
                      <Star className="w-3 h-3" />
                      Skills ({tech.technician_skills.length})
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {tech.technician_skills.map((ts) => (
                        <div
                          key={ts.skill_id}
                          className={`flex items-center gap-2 px-2 py-1 rounded-lg text-xs ${
                            selectedSkills.has(ts.skill_id)
                              ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                              : 'bg-gray-800 text-gray-300 border border-gray-700'
                          }`}
                        >
                          <span>{ts.skills.name}</span>
                          {getProficiencyBadge(ts.proficiency_level)}
                          {ts.certified && (
                            <Award className="w-3 h-3 text-yellow-400" />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
