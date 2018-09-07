/* eslint import/no-unresolved: 0 */
import Vue from 'vue'
import md5 from 'md5'
import ReportDownloaderMixin from '../mixins/ReportDownloader.vue'
import { EventBus } from '../services/event-bus.js'
import { UserService } from '../services/user-service.js'

export const SimulationService = new Vue({
  computed: {
    canBeEdited() {
      return this.simulation.status === 'new'
    },
    mappingOptions: {
      get() {
        // If they haven't yet been loaded, try to get them from the API
        if (this.internalMappingOptions === null) {
          this.getMappingOptions()
        }
        return this.internalMappingOptions
      },
      set(value) {
        this.internalMappingOptions = value
      },
    },
  },
  created() {
    EventBus.$on('logout', this.clearUserData)
    this.clearUserData()
  },
  data() {
    return {
      activeSimulationCount: 0,
      internalMappingOptions: null,
      loadingMappingOptions: false,
      simulation: {},
    }
  },
  methods: {
    /**
     * Activates a simulation
     * @param  {Number} [id] The ID of the simulation to activate. If omitted, use the currently loaded simulation
     * @return {promise}
     */
    activateSimulation(id = this.simulation.id) {
      return this.axios.patch(`admin/budgets/${id}`, {
        status: 'active',
      })
        .catch((error) => {
          let messageText = 'An error occurred while activating this Simulation'
          if (error.response && error.response.data && error.response.data.errors && error.response.data.errors.status) {
            messageText += `: ${error.response.data.errors.status.join(' ')}`
          } else {
            messageText += '.'
          }
          EventBus.$emit('show-error', messageText)
          return Promise.reject()
        })
    },
    /**
     * Adds a subcategory to a category
     * @param {string} type 'revenue' or 'expense'
     * @param {number} categoryId The parent category ID
     */
    addSubcategory(type, categoryId) {
      let category = null
      const blankSubcategory = {
        additional_details: '',
        alert_text: '',
        alert_type: 'none',
        amount: 0,
        budget_category_id: categoryId,
        ceiling_alert_text: null,
        ceiling_amount: 0,
        custom_increment_amount: 0,
        custom_increment_rate: 0,
        customized_question_json: null,
        details: '',
        display_order: 0,
        floor_alert_text: null,
        floor_amount: 0,
        id: 0 - Math.floor(Math.random() * 1000000),
        is_locked: false,
        name: null,
        rate: 0,
        share_title: null,
      }
      if (type === 'expense') {
        category = this.getExpenseCategoryById(categoryId)
      } else if (type === 'revenue') {
        category = this.getRevenueCategoryById(categoryId)
      } else {
        // Invalid category type
        return
      }
      category.subcategories.unshift(blankSubcategory)
    },

    /**
     * Checks that the slug is unique. It can only already exist for the current simulation.
     * @param  {string} [value=this.simulation.slug] The slug value
     * @param  {boolean} [autosave=false] Automatically saves the slug if it is valid
     * @return {boolean} Whether or not the slug is available and valid
     */
    checkSlugIsUnique(value = this.simulation.slug, autoSave = false) {
      let url = `admin/validate-subdomain-slug?slug=${value}`
      if (this.simulation.id) {
        url += `&budget_id=${this.simulation.id}`
      }
      return Vue.axios.get(url)
        .then(() => {
          if (autoSave === true && this.simulation.id) {
            this.saveSimulation('slug')
          }
          return true
        })
        .catch(() => false)
    },

    /**
     * Resets all user data
     * @return void
     */
    clearUserData() {
      this.activeSimulationCount = 0
      this.internalMappingOptions = null
      this.loadingMappingOptions = false
      this.simulation = {
        adjustment: null,
        custom_header_html: null,
        description: null,
        expense_disclaimer: null,
        general_disclaimer: null,
        id: null,
        is_budget_hidden: false,
        is_budget_submittable_with_deficit: false,
        is_commenting_enabled: false,
        is_expense_chart_enabled: true,
        is_expense_order_randomized: false,
        is_footer_hidden: false,
        is_question_management_enabled: false,
        is_revenue_chart_enabled: true,
        is_revenue_order_randomized: false,
        is_sharing_enabled: false,
        is_tax_receipt_subtotal_breakdown_enabled: false,
        locale: 'en_US',
        name: '',
        revenue_disclaimer: null,
        slug: null,
        status: 'new',
        submission_redirect_url: null,
        timer_minutes: 0,
        expenses: [],
        revenue: [],
        demographics: [],
      }
    },

    /**
     * Deletes an Expense Category
     * @param  {number} id The category ID
     * @return {promise}
     */
    deleteExpenseCategory(id) {
      if (id > 0) { // negative IDs have not yet been persisted to the API
        return this.axios.delete(`admin/budgets/${this.simulation.id}/expenses/${id}`)
          .then(() => {
            this.fetchSimulation()
          })
      }
      return this.fetchSimulation()
    },

    /**
     * Deletes an Expense Subcategory
     * @param  {number} categoryId The parent category ID
     * @param  {number} subcategoryId The subcategory ID
     * @return {promise}
     */
    deleteExpenseSubcategory(categoryId, subcategoryId) {
      if (subcategoryId > 0) {
        return this.axios.delete(`admin/budgets/${this.simulation.id}/expenses/${categoryId}/subcategories/${subcategoryId}`)
          .then(() => {
            this.fetchSimulation()
          })
      }
      return this.fetchSimulation()
    },

    /**
     * Deletes a Revenue Category
     * @param  {number} id The category ID
     * @return {promise}
     */
    deleteRevenueCategory(id) {
      if (id > 0) { // negative IDs have not yet been persisted to the API
        return this.axios.delete(`admin/budgets/${this.simulation.id}/revenue/${id}`)
          .then(() => {
            this.fetchSimulation()
          })
      }
      return this.fetchSimulation()
    },

    /**
     * Deletes a Revenue Subcategory
     * @param  {number} categoryId The parent category ID
     * @param  {number} subcategoryId The subcategory ID
     * @return {promise}
     */
    deleteRevenueSubcategory(categoryId, subcategoryId) {
      if (subcategoryId > 0) { // negative IDs have not yet been persisted to the API
        return this.axios.delete(`admin/budgets/${this.simulation.id}/revenue/${categoryId}/subcategories/${subcategoryId}`)
          .then(() => {
            this.fetchSimulation()
          })
      }
      return this.fetchSimulation()
    },

    /**
     * Retrieves a specific simulation for this user
     * @param  {number} id The simulation ID
     * @return {promise}
     */
    fetchSimulation(id = this.simulation.id) {
      return Vue.axios.get(`admin/budgets/${id}?include=revenue,revenue.subcategories,expenses.subcategories,expenses,demographics`)
        .then((response) => {
          // Set some fields that default to null to an empty string instead, to prevent validation errors
          response.data.data.description = response.data.data.description || ''
          response.data.data.expense_disclaimer = response.data.data.expense_disclaimer || ''
          response.data.data.general_disclaimer = response.data.data.general_disclaimer || ''
          response.data.data.revenue_disclaimer = response.data.data.revenue_disclaimer || ''
          response.data.data.slug = response.data.data.slug || ''

          this.simulation = response.data.data
          return response
        })
    },

    /**
     * Retrieves a list of all simulations for this user
     * @return {promise}
     */
    fetchSimulationList() {
      return this.axios.get('admin/budgets?per_page=1000')
        .then((results) => {
          const budgets = results.data.data
          let simulations = []
          this.activeSimulationCount = 0
          if (budgets.length > 0) {
            budgets.forEach((budget) => {
              const budgetUrl = process.env.FRONTEND_SITE_URL.replace('{0}', UserService.subdomain) + budget.slug
              simulations.push({
                id: budget.id,
                name: budget.name,
                description: budget.description,
                // Capitalize the first letter of the status
                status: budget.status.charAt(0).toUpperCase() + budget.status.slice(1).toLowerCase(),
                url: budgetUrl,
                fullUrl: budgetUrl,
                previewUrl: `${budgetUrl}?preview=${md5(budget.id | BAEP)}`,
                can_preview: budget.can_preview,
                can_publish: budget.can_publish,
              })
              if (budget.status === 'active') {
                this.activeSimulationCount += 1
              }
            })

            // Sort the simulations by name
            simulations = simulations.sort((a, b) => {
              const nameA = a.name.toUpperCase()
              const nameB = b.name.toUpperCase()
              if (nameA < nameB) {
                return -1
              }
              if (nameA > nameB) {
                return 1
              }
              return 0
            })
          }
          this.contentLoaded = true
          return simulations
        })
    },

    /**
     * Loads the mapping options from the API
     * @return void
     */
    getMappingOptions() {
      const self = this
      if (this.loadingMappingOptions) {
        return
      }
      this.loadingMappingOptions = true
      Vue.axios.get('admin/standardized-subcategories?per_page=1000')
        .then((response) => {
          // Sort the results
          let options = response.data.data
          options = options.sort((a, b) => {
            const nameA = a.name.toUpperCase()
            const nameB = b.name.toUpperCase()
            if (nameA < nameB) {
              return -1
            }
            if (nameA > nameB) {
              return 1
            }
            return 0
          })

          self.internalMappingOptions = {
            expense: options.filter(option => option.type === 'expense'),
            revenue: options.filter(option => option.type === 'revenue'),
          }
          self.loadingMappingOptions = false
        })
        .catch(() => {
          // allow it to try again
          self.loadingMappingOptions = false
        })
    },

    /**
     * Gets an expense category object
     * @param  {number} categoryId The category ID
     * @return {Object|null}
     */
    getExpenseCategoryById(categoryId) {
      const index = this.getExpenseCategoryIndexById(categoryId)
      return index ? this.simulation.expenses[index] : null
    },

    /**
     * Gets an expense category index in the array
     * @param  {number} categoryId The category ID
     * @return {number|null}
     */
    getExpenseCategoryIndexById(categoryId) {
      let matchingIndex = null
      this.simulation.expenses.forEach((category, index) => {
        if (category.id === categoryId) {
          matchingIndex = index
        }
      })
      return matchingIndex
    },

    /**
     * Gets a revenue category object
     * @param  {number} categoryId The category ID
     * @return {Object|null}
     */
    getRevenueCategoryById(categoryId) {
      const index = this.getRevenueCategoryIndexById(categoryId)
      return index ? this.simulation.revenue[index] : null
    },

    /**
     * Gets a revenue category index in the array
     * @param  {number} categoryId The category ID
     * @return {number|null}
     */
    getRevenueCategoryIndexById(categoryId) {
      let matchingIndex = null
      this.simulation.revenue.forEach((category, index) => {
        if (category.id === categoryId) {
          matchingIndex = index
        }
      })
      return matchingIndex
    },

    /**
     * Gets a subcategory object
     * @param  Object category The parent category object
     * @param  {number} subcategoryId The subcategory ID
     * @return {Object|null}
     */
    getSubcategoryById(category, subcategoryId) {
      const index = this.getSubcategoryIndexById(category, subcategoryId)
      return index ? category.subcategories[index] : null
    },

    /**
     * Gets a subcategory index in the array
     * @param  Object category The parent category object
     * @param  {number} subcategoryId The subcategory ID
     * @return {number|null}
     */
    getSubcategoryIndexById(category, subcategoryId) {
      let matchingIndex = null
      category.subcategories.forEach((subcategory, index) => {
        if (subcategory.id === subcategoryId) {
          matchingIndex = index
        }
      })
      return matchingIndex
    },

    /**
     * @param  {number} subcategoryId The subcategory ID
     * @param  {number} oldCategoryId The category ID to move FROM
     * @param  {number} newCategoryId The category ID to move TO
     * @return {promise}
     */
    moveExpenseSubcategory(subcategoryId, oldCategoryId, newCategoryId) {
      EventBus.$emit('show-loading')
      // Update the parent ID of the sub-category
      return this.axios.patch(`admin/budgets/${this.simulation.id}/expenses/${oldCategoryId}/subcategories/${subcategoryId}`, {
        budget_category_id: newCategoryId,
      })
        .then(() => {
          // Save the updated display orders of both the old and new category
          this.axios.all([this.saveExpenseSubcategoryOrder(oldCategoryId), this.saveExpenseSubcategoryOrder(newCategoryId)])
            .then(() => {
              // Refresh the simulation data
              this.fetchSimulation()
            })
        })
    },

    /**
     * @param  {number} subcategoryId The subcategory ID
     * @param  {number} oldCategoryId The category ID to move FROM
     * @param  {number} newCategoryId The category ID to move TO
     * @return {promise}
     */
    moveRevenueSubcategory(subcategoryId, oldCategoryId, newCategoryId) {
      EventBus.$emit('show-loading')
      // Update the parent ID of the sub-category
      return this.axios.patch(`admin/budgets/${this.simulation.id}/revenue/${oldCategoryId}/subcategories/${subcategoryId}`, {
        budget_category_id: newCategoryId,
      })
        .then(() => {
          // Save the updated display orders of both the old and new category
          this.axios.all([this.saveRevenueSubcategoryOrder(oldCategoryId), this.saveRevenueSubcategoryOrder(newCategoryId)])
            .then(() => {
              // Refresh the simulation data
              this.fetchSimulation()
            })
        })
    },

    /**
     * Saves the general fields for the simulation. Does not save the categories or demographics.
     * @param {string} [field=null] If provided, only save that field
     * @return {promise}
     */
    saveSimulation(field) {
      // create a duplicate of the simulation object, and remove some of the fields we don't want to send
      let simulationData = {}
      if (field) {
        simulationData[field] = this.simulation[field]

        // Number-only fields
        if (field === 'adjustment') {
          simulationData[field] = parseFloat(this.simulation[field].toString()
            .replace(/[^0-9.]/g, ''))
        }
      } else {
        simulationData = JSON.parse(JSON.stringify(this.simulation))
        delete simulationData.id
        delete simulationData.client_id
        delete simulationData.expenses
        delete simulationData.revenue
        delete simulationData.demographics
        delete simulationData.legacy_id
        delete simulationData.status
        delete simulationData.status_at
        delete simulationData.created_at
        delete simulationData.updated_at
        simulationData.adjustment = parseFloat(this.simulation.adjustment.toString()
          .replace(/[^0-9.]/g, ''))
      }

      return this.axios.patch(`admin/budgets/${this.simulation.id}`, simulationData)
        .then((response) => {
          // These fields may be modified by the API upon save, so update to what is returned by the API.
          if (field === 'expense_disclaimer') {
            this.simulation.expense_disclaimer = response.data.data.expense_disclaimer
          }
          if (field === 'revenue_disclaimer') {
            this.simulation.revenue_disclaimer = response.data.data.revenue_disclaimer
          }
          return response
        })
    },

    /**
     * Saves the current order of a the expense categories
     * @return {promise}
     */
    saveExpenseCategoryOrder() {
      const expenseCategoryOrder = []
      this.simulation.expenses.forEach((category) => {
        if (category.id > 0) { // Don't update categories that haven't yet been persisted to the API
          expenseCategoryOrder.push(category.id)
        }
      })
      return this.axios.post(`admin/budgets/${this.simulation.id}/expenses/set-order`, {
        display_order: expenseCategoryOrder,
      })
    },

    /**
     * Saves the current order of a set of expense subcategories
     * @param  {number} categoryId The category ID to save
     * @return {promise|null}
     */
    saveExpenseSubcategoryOrder(categoryId) {
      const expenseSubcategoryOrder = []
      const category = this.getExpenseCategoryById(categoryId)
      if (!category) {
        return null
      }
      category.subcategories.forEach((subcategory) => {
        if (subcategory.id > 0) { // Don't update subcategories that haven't yet been persisted to the API
          expenseSubcategoryOrder.push(subcategory.id)
        }
      })
      return this.axios.post(`admin/budgets/${this.simulation.id}/expenses/${categoryId}/subcategories/set-order`, {
        display_order: expenseSubcategoryOrder,
      })
    },

    /**
     * Saves the current order of a the revenue categories
     * @return {promise}
     */
    saveRevenueCategoryOrder() {
      const revenueCategoryOrder = []
      this.simulation.revenue.forEach((category) => {
        if (category.id > 0) { // Don't update categories that haven't yet been persisted to the API
          revenueCategoryOrder.push(category.id)
        }
      })
      return this.axios.post(`admin/budgets/${this.simulation.id}/revenue/set-order`, {
        display_order: revenueCategoryOrder,
      })
    },

    /**
     * Saves the current order of a set of revenue subcategories
     * @param  {number} categoryId The category ID to save
     * @return {promise}
     */
    saveRevenueSubcategoryOrder(categoryId) {
      const revenueSubcategoryOrder = []
      const category = this.getRevenueCategoryById(categoryId)
      if (!category) {
        return null
      }
      category.subcategories.forEach((subcategory) => {
        if (subcategory.id > 0) { // Don't update subcategories that haven't yet been persisted to the API
          revenueSubcategoryOrder.push(subcategory.id)
        }
      })
      return this.axios.post(`admin/budgets/${this.simulation.id}/revenue/${categoryId}/subcategories/set-order`, {
        display_order: revenueSubcategoryOrder,
      })
    },

    /**
     * Saves a category to the database. If it is a new category (id < 1), it will be created, otherwise it will be updated.
     * @param  {string} type The type of category: "expense" or "revenue"
     * @param  {number} id   The category ID
     * @return {promise}
     */
    saveCategory(type, id) {
      let category = null
      let url = `admin/budgets/${this.simulation.id}/`

      if (type === 'expense') {
        category = this.getExpenseCategoryById(id)
        url += 'expenses'
      } else if (type === 'revenue') {
        category = this.getRevenueCategoryById(id)
        url += 'revenue'
      } else {
        throw new Error('Invalid type')
      }
      if (!category) {
        throw new Error('Invalid category ID')
      }

      // create a duplicate of the category, and remove some of the fields we don't want to send
      const submissionCategory = JSON.parse(JSON.stringify(category))
      delete submissionCategory.subcategories
      delete submissionCategory.id
      delete submissionCategory.created_at
      delete submissionCategory.updated_at

      if (id > 0) {
        // update an existing category
        url += `/${id}`
        return this.axios.patch(url, submissionCategory)
          .then((response) => {
            // Replace with server response in case images were uploaded
            category.additional_details = response.data.data.additional_details
            return response
          })
      }
      // create a new category
      return this.axios.post(url, submissionCategory)
        .then((response) => {
          category.id = response.data.data.id
          // Replace with server response in case images were uploaded
          category.additional_details = response.data.data.additional_details
          if (type === 'expense') {
            this.saveExpenseCategoryOrder()
          }
          if (type === 'revenue') {
            this.saveRevenueCategoryOrder()
          }
          this.addSubcategory(type, response.data.data.id)
          EventBus.$emit('category-added', type)
          return response
        })
    },

    /**
     * Saves a subcategory to the database. If it is a new subcategory (id < 1), it will be created, otherwise it will be updated.
     * @param  {string} type The type of the parent category: "expense" or "revenue"
     * @param  {number} subcategoryId The subcategory ID
     * @param  {number} categoryId The category ID
     * @return {promise}
     */
    saveSubcategory(type, subcategoryId, categoryId) {
      let category = null
      let subcategory = null
      let url = `admin/budgets/${this.simulation.id}/`

      if (type === 'expense') {
        category = this.getExpenseCategoryById(categoryId)
        if (!category) {
          throw new Error('Invalid category ID')
        }
        subcategory = this.getSubcategoryById(category, subcategoryId)
        url += 'expenses'
      } else if (type === 'revenue') {
        category = this.getRevenueCategoryById(categoryId)
        if (!category) {
          throw new Error('Invalid category ID')
        }
        subcategory = this.getSubcategoryById(category, subcategoryId)
        url += 'revenue'
      } else {
        throw new Error('Invalid type')
      }
      if (!subcategory) {
        throw new Error('Invalid subcategory ID')
      }

      url += `/${categoryId}/subcategories`

      // create a duplicate of the category, and remove some of the fields we don't want to send
      const submissionSubcategory = JSON.parse(JSON.stringify(subcategory))
      delete submissionSubcategory.id
      delete submissionSubcategory.created_at
      delete submissionSubcategory.updated_at
      if (!Object.prototype.hasOwnProperty.call(submissionSubcategory, 'amount')) {
        submissionSubcategory.amount = 0
      }

      if (subcategoryId > 0) {
        // update an existing subcategory
        url += `/${subcategoryId}`
        return this.axios.patch(url, submissionSubcategory)
          .then((response) => {
            // Replace with server response in case images were uploaded
            subcategory.additional_details = response.data.data.additional_details
            subcategory.alert_text = response.data.data.alert_text
            subcategory.ceiling_alert_text = response.data.data.ceiling_alert_text
            subcategory.floor_alert_text = response.data.data.floor_alert_text
            subcategory.customized_question_json = response.data.data.customized_question_json

            return response
          })
      }
      return this.axios.post(url, submissionSubcategory)
        .then((response) => {
          subcategory.id = response.data.data.id
          // Replace with server response in case images were uploaded
          subcategory.additional_details = response.data.data.additional_details
          subcategory.alert_text = response.data.data.alert_text
          subcategory.ceiling_alert_text = response.data.data.ceiling_alert_text
          subcategory.floor_alert_text = response.data.data.floor_alert_text
          subcategory.customized_question_json = response.data.data.customized_question_json
          if (type === 'expense') {
            this.saveExpenseSubcategoryOrder(categoryId)
          }
          if (type === 'revenue') {
            this.saveRevenueSubcategoryOrder(categoryId)
          }
          return response
        })
    },

    /**
     * Updates all category matching for a group of categories
     * @param  {string} type Either 'expenses' or 'revenue'
     * @param  {Array} categories An array of categories to update
     * @return void
     */
    updateSubcategoryMatching(type, categories) {
      categories.forEach((updatedCategory) => {
        let simulationCategory = null
        if (type === 'expense') {
          simulationCategory = this.getExpenseCategoryById(updatedCategory.id)
        } else if (type === 'revenue') {
          simulationCategory = this.getRevenueCategoryById(updatedCategory.id)
        }

        if (simulationCategory) {
          updatedCategory.subcategories.forEach((updatedSubcategory) => {
            const simulationSubcategory = this.getSubcategoryById(simulationCategory, updatedSubcategory.id)
            if (simulationSubcategory && (simulationSubcategory.standardized_subcategory_id !== updatedSubcategory.standardized_subcategory_id)) {
              simulationSubcategory.standardized_subcategory_id = updatedSubcategory.standardized_subcategory_id
              this.saveSubcategory(type, simulationSubcategory.id, simulationCategory.id)
            }
          })
        }
      })
      return true
    },
  },
  mixins: [ReportDownloaderMixin],
})
