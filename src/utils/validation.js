'use strict';

const Ajv = require('ajv');
const {omit} = require('lodash');

const errorParser = require('./error_parser');
const {combineRequestSchemas} = require('./combine_request_schemas');

/**
 * uses ajv to validate request parameters against schema determined by request route and request method
 * $ref will resolve only `#/components/schemas/...` same as openapi schema
 */
module.exports = ({components, paths, ajvOptions}) => {
	const ajv = new Ajv({
		allErrors: true,
		removeAdditional: true,
		...ajvOptions
	});

	ajv.addSchema({
		$id: '_',
		components
	});

	const combinedSchemas = {};

	return ({body, headers, method, params, query, route}) => {
		const path = route.replace(/:[^/]*/, match => `{${match.slice(1)}}`);
		const data = paths[path][method];

		let toValidate = {};
		switch (method) {
			case 'post':
			case 'put':
			case 'patch':
			case 'delete':
				toValidate = {
					header: headers,
					path: params,
					body
				};
				break;
			case 'get':
				toValidate = {
					header: headers,
					query,
					path: params
				};
				break;
			default:
				throw new Error('Method not allowed');
		}

		let combinedSchema;

		if (combinedSchemas[path] && combinedSchemas[path][method]) {
			combinedSchema = combinedSchemas[path][method];
		} else {
			combinedSchema = combineRequestSchemas(data, Object.keys(toValidate));

			combinedSchemas[path] = {
				...combinedSchema[path],
				[method]: combinedSchema
			};
		}

		const isValid = ajv.validate(combinedSchema, toValidate);
		if (!isValid) {
			const error = new Error('Schema validation error');

			if (ajv.errors) {
				const errors = errorParser.parse(ajv.errors);
				error.details = errors.map(e => omit(e, ['ajv']));
				error.ajv = errors.map(e => e.ajv);
			}

			throw error;
		}
	};
};
